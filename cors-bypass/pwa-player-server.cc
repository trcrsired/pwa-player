/*
 * A node.js `http-server` look-alike on fast_io's async socket machinery:
 * a static HTTP/1.1 file server.
 *
 *   http-server [root] [-p port] [-c seconds] [--no-index] [--no-dir]
 *
 * Feature parity with the node tool's defaults: percent-decoded paths
 * with ".." clamped at the root (path.normalize semantics), directory
 * redirect to a trailing slash, index.html, an HTML directory listing,
 * Content-Type by extension, ETag + If-None-Match, If-Modified-Since,
 * single byte ranges, HEAD, and keep-alive. Skipped: TLS, precompressed
 * .gz/.br variants, -o browser launch.
 *
 * One detached coroutine per connection plus the accept coroutine —
 * the same two-coroutine shape as tcp_echo_server.cc.
 */
#include <fast_io.h>
#include <fast_io_crypto.h>
#include <fast_io_device.h>
#include <fast_io_dsal/string.h>
#include <fast_io_dsal/string_view.h>
#include <fast_io_hosted_crypto.h>

namespace fi = ::fast_io;
namespace fop = ::fast_io::operations;

/* ------------------------------ mime ------------------------------ */

static bool ascii_ieq(fi::u8string_view a, fi::u8string_view b) noexcept
{
	if (a.size() != b.size())
	{
		return false;
	}
	for (::std::size_t i{}; i != a.size(); ++i)
	{
		auto x{a[i]};
		auto y{b[i]};
		if (u8'A' <= x && x <= u8'Z')
		{
			x = static_cast<char8_t>(x + 32);
		}
		if (u8'A' <= y && y <= u8'Z')
		{
			y = static_cast<char8_t>(y + 32);
		}
		if (x != y)
		{
			return false;
		}
	}
	return true;
}

struct mime_entry
{
	fi::u8string_view ext;
	fi::u8string_view type;
};

/* the common web formats; anything else is application/octet-stream */
static constexpr mime_entry mime_table[]{
	{u8"html", u8"text/html"},
	{u8"htm", u8"text/html"},
	{u8"css", u8"text/css"},
	{u8"js", u8"text/javascript"},
	{u8"mjs", u8"text/javascript"},
	{u8"json", u8"application/json"},
	{u8"txt", u8"text/plain"},
	{u8"md", u8"text/markdown"},
	{u8"xml", u8"text/xml"},
	{u8"csv", u8"text/csv"},
	{u8"pdf", u8"application/pdf"},
	{u8"wasm", u8"application/wasm"},
	{u8"png", u8"image/png"},
	{u8"jpg", u8"image/jpeg"},
	{u8"jpeg", u8"image/jpeg"},
	{u8"gif", u8"image/gif"},
	{u8"webp", u8"image/webp"},
	{u8"svg", u8"image/svg+xml"},
	{u8"ico", u8"image/x-icon"},
	{u8"bmp", u8"image/bmp"},
	{u8"avif", u8"image/avif"},
	{u8"mp3", u8"audio/mpeg"},
	{u8"wav", u8"audio/wav"},
	{u8"ogg", u8"audio/ogg"},
	{u8"m4a", u8"audio/mp4"},
	{u8"aac", u8"audio/aac"},
	{u8"flac", u8"audio/flac"},
	{u8"opus", u8"audio/ogg"},
	{u8"mp4", u8"video/mp4"},
	{u8"m4v", u8"video/mp4"},
	{u8"webm", u8"video/webm"},
	{u8"mov", u8"video/quicktime"},
	{u8"mkv", u8"video/x-matroska"},
	{u8"avi", u8"video/x-msvideo"},
	{u8"ts", u8"video/mp2t"},
	{u8"m2ts", u8"video/mp2t"},
	{u8"flv", u8"video/x-flv"},
	{u8"vtt", u8"text/vtt"},
	{u8"srt", u8"application/x-subrip"},
	{u8"ass", u8"text/x-ssa"},
	{u8"woff", u8"font/woff"},
	{u8"woff2", u8"font/woff2"},
	{u8"ttf", u8"font/ttf"},
	{u8"otf", u8"font/otf"},
	{u8"zip", u8"application/zip"},
	{u8"gz", u8"application/gzip"},
	{u8"tar", u8"application/x-tar"},
	{u8"7z", u8"application/x-7z-compressed"},
	{u8"rar", u8"application/vnd.rar"},
	{u8"map", u8"application/json"}};

static fi::u8string_view mime_type_of(fi::u8string_view path) noexcept
{
	auto const first{path.data()};
	auto const last{first + path.size()};
	auto const *dot{last};
	for (auto i{last}; i != first;)
	{
		--i;
		if (*i == u8'.')
		{
			dot = i;
			break;
		}
		if (*i == u8'/')
		{
			break;
		}
	}
	if (dot == last)
	{
		return u8"application/octet-stream";
	}
	fi::u8string_view const ext{dot + 1,
								static_cast<::std::size_t>(last - dot - 1)};
	for (auto const &e : mime_table)
	{
		if (ascii_ieq(ext, e.ext))
		{
			return e.type;
		}
	}
	return u8"application/octet-stream";
}

/* node appends charset=utf-8 to textual types (sniffed) and js/json */
static bool mime_is_text(fi::u8string_view type) noexcept
{
	constexpr fi::u8string_view t{u8"text/"};
	return (type.size() >= t.size() &&
			fi::u8string_view{type.data(), t.size()} == t) ||
		   type == fi::u8string_view{u8"application/json"} ||
		   type == fi::u8string_view{u8"image/svg+xml"};
}

/* --------------------------- http dates --------------------------- */

static constexpr char8_t wkday_names[][4]{{u8"Sun"}, {u8"Mon"}, {u8"Tue"}, {u8"Wed"}, {u8"Thu"}, {u8"Fri"}, {u8"Sat"}};

static constexpr char8_t month_names[][4]{
	{u8"Jan"}, {u8"Feb"}, {u8"Mar"}, {u8"Apr"}, {u8"May"}, {u8"Jun"}, {u8"Jul"}, {u8"Aug"}, {u8"Sep"}, {u8"Oct"}, {u8"Nov"}, {u8"Dec"}};

/* "Sun, 06 Nov 1994 08:49:37 GMT" — a fixed 29 bytes */
static fi::u8string imf_date(::std::int_least64_t unix_seconds) noexcept
{
	auto days{unix_seconds / 86400};
	auto secs{unix_seconds % 86400};
	if (secs < 0)
	{
		secs += 86400;
		--days;
	}
	auto const iso{fi::utc(::fast_io::posix_statx_timestamp64{days * 86400, 0})};
	auto const wday{static_cast<::std::size_t>(((days % 7) + 11) % 7)};
	/* days==0 is Thursday → index 4; +11 keeps the modulo positive */
	fi::u8string out(29, u8' ');
	auto *p{out.data()};
	__builtin_memcpy(p, wkday_names[wday], 3);
	p += 3;
	*p++ = u8',';
	*p++ = u8' ';
	*p++ = static_cast<char8_t>(u8'0' + iso.day / 10);
	*p++ = static_cast<char8_t>(u8'0' + iso.day % 10);
	*p++ = u8' ';
	__builtin_memcpy(p, month_names[iso.month - 1], 3);
	p += 3;
	*p++ = u8' ';
	auto const y{iso.year};
	*p++ = static_cast<char8_t>(u8'0' + (y / 1000) % 10);
	*p++ = static_cast<char8_t>(u8'0' + (y / 100) % 10);
	*p++ = static_cast<char8_t>(u8'0' + (y / 10) % 10);
	*p++ = static_cast<char8_t>(u8'0' + y % 10);
	*p++ = u8' ';
	auto const hh{secs / 3600};
	auto const mm{secs / 60 % 60};
	auto const ss{secs % 60};
	*p++ = static_cast<char8_t>(u8'0' + hh / 10);
	*p++ = static_cast<char8_t>(u8'0' + hh % 10);
	*p++ = u8':';
	*p++ = static_cast<char8_t>(u8'0' + mm / 10);
	*p++ = static_cast<char8_t>(u8'0' + mm % 10);
	*p++ = u8':';
	*p++ = static_cast<char8_t>(u8'0' + ss / 10);
	*p++ = static_cast<char8_t>(u8'0' + ss % 10);
	__builtin_memcpy(p, u8" GMT", 4);
	return out;
}

static constexpr int hex_val(char8_t c) noexcept
{
	if (u8'0' <= c && c <= u8'9')
	{
		return c - u8'0';
	}
	if (u8'a' <= c && c <= u8'f')
	{
		return c - u8'a' + 10;
	}
	if (u8'A' <= c && c <= u8'F')
	{
		return c - u8'A' + 10;
	}
	return -1;
}

/* IMF-fixdate parse through the library manipulator — throws a parse
 * error on anything unrecognized or not fully consumed; the callers
 * catch it the same way node's Date.parse failure just skips the 304
 * check */
static ::std::int_least64_t parse_imf_date(fi::u8string_view v) throws
{
	::std::int_least64_t t{};
	fi::basic_ibuffer_view<char8_t> ibv{v.data(), v.data() + v.size()};
	fi::scan(ibv, fi::mnp::imf_date_get(t));
	if (ibv.curr_ptr != ibv.end_ptr)
	{
		fi::herbceptions::throws_parse_errc(fi::freestanding::parse_errc::invalid);
	}
	return t;
}

/* --------------------- request-target handling -------------------- */

/*
 * decode_target: percent-decode the request-target, drop the query,
 * fold '\' to '/', then normalize like node's path.normalize: empty and
 * "." segments vanish, ".." pops the previous segment and clamps at the
 * root — a traversal can never produce a path outside root. Returns
 * false on malformed %-escapes or control characters (the analog of
 * node's decodeURIComponent throw → 400). `trailing_slash` reports
 * whether the raw target ended in '/', for the directory redirect.
 */
static bool decode_target(fi::u8string_view target, fi::u8string &out,
						  bool &trailing_slash)
{
	auto const *first{target.data()};
	auto const *last{first + target.size()};
	for (auto i{first}; i != last; ++i)
	{
		if (*i == u8'?' || *i == u8'#')
		{
			last = i;
			break;
		}
	}
	trailing_slash = last != first && last[-1] == u8'/';
	/* the url_path filter is the traversal guard: malformed escapes,
	 * decoded control/NUL/backslash, or any ".." segment → 400 */
	try
	{
		fi::mnp::string_filters::url_path(
			fi::u8string_view{first, static_cast<::std::size_t>(last - first)});
	}
	catch throws(::std::error)
	{
		return false;
	}
	fi::u8string decoded;
	for (auto i{first}; i != last; ++i)
	{
		char8_t c{*i};
		if (c == u8'%')
		{
			if (last - i < 3)
			{
				return false;
			}
			int const hi{hex_val(i[1])}, lo{hex_val(i[2])};
			if (hi < 0 || lo < 0)
			{
				return false;
			}
			c = static_cast<char8_t>((hi << 4) | lo);
			i += 2;
		}
		if (c == u8'\\')
		{
			c = u8'/';
		}
		if (c < 0x20 || c == 0x7f)
		{
			return false;
		}
		decoded.push_back(c);
	}
	/* normalize: out accumulates "seg/seg" with no leading slash; ".."
	 * pops back to the previous separator, clamped when already empty */
	out.clear();
	auto const *dfirst{decoded.data()};
	auto const *dlast{dfirst + decoded.size()};
	for (auto seg{dfirst};;)
	{
		auto e{seg};
		while (e != dlast && *e != u8'/')
		{
			++e;
		}
		fi::u8string_view const piece{seg, static_cast<::std::size_t>(e - seg)};
		if (piece == fi::u8string_view{u8".."})
		{
			if (!out.empty())
			{
				auto n{out.size()};
				while (n != 0 && out.data()[n - 1] != u8'/')
				{
					--n;
				}
				out.assign(fi::u8string_view{out.data(), n == 0 ? 0 : n - 1});
			}
		}
		else if (!piece.empty() && piece != fi::u8string_view{u8"."})
		{
			if (!out.empty())
			{
				out.push_back(u8'/');
			}
			out.append(piece.data(), piece.size());
		}
		if (e == dlast)
		{
			break;
		}
		seg = e + 1;
	}
	return true;
}

/* ------------------------------ model ----------------------------- */

/*
 * The root is an open dir handle, not a path string: every lookup goes
 * through openat/fstatat relative to it. Combined with the normalized
 * rel (no "..", no leading slash) a request physically cannot name a
 * file outside the tree.
 */
/* a peer whose source is broader than the configured WICG LNA space
 * gets a 403 and nothing else — decided once per connection */
struct server_cfg
{
	fi::native_at_entry root{};
	/* full "\r\nAccess-Control-Allow-Origin: *..." header block, built
	 * once in main when --cors is on; empty means no CORS headers */
	fi::u8string cors_block;
	::std::size_t cache_seconds{3600};
	fi::ip_address_space lna_max{fi::ip_address_space::local_address};
	/* exact-match peers from --lna <literal|hostname> — non-empty
	 * switches the gate from space-cap to allow-list */
	fi::containers::vector<fi::ip_address, fi::native_global_allocator>
		allowed_peers;
	bool autoindex{true};
	bool showdir{true};
	bool cors{};
	bool bypass{};
	bool http{}; /* --server — static file serving is opt-in; the
				  * bypass proxy is this binary's default role */
};

/* views point into the request's http_header_buffer — alive until the
 * session's next scan */
struct http_request
{
	fi::u8string_view method{};
	fi::u8string_view target{};
	fi::u8string_view version{};
	fi::u8string_view connection{};
	fi::u8string_view range{};
	fi::u8string_view inm{};      /* If-None-Match */
	fi::u8string_view ims{};      /* If-Modified-Since */
	fi::u8string_view if_range{}; /* If-Range — mismatch degrades 206 to 200 */
	fi::u8string_view upgrade{};  /* Upgrade */
	fi::u8string_view wskey{};    /* Sec-WebSocket-Key */
	fi::u8string_view wsver{};    /* Sec-WebSocket-Version */
	fi::u8string_view host{};     /* Host */
	fi::u8string_view origin{};   /* Origin — echoed into bypass ACAO */
	bool head_only{};
	bool keep_alive{};
};

struct range_result
{
	::std::uint_least64_t start{};
	::std::uint_least64_t length{};
	bool present{};
};

/*
 * Range: bytes=a-b | a- | -n — a single range, like node's parse.
 * Empty or non-"bytes=" input is "not present" (serve the whole file);
 * a malformed or unsatisfiable range throws parse_errc → the caller
 * answers 416. Number fields go through parse_by_scan — the scanner's
 * own overflow/invalid reporting is the field check.
 */
static range_result parse_range(fi::u8string_view rv,
								::std::uint_least64_t size) throws
{
	constexpr fi::u8string_view prefix{u8"bytes="};
	if (rv.size() <= prefix.size() ||
		fi::u8string_view{rv.data(), prefix.size()} != prefix)
	{
		return {};
	}
	rv = fi::u8string_view{rv.data() + prefix.size(), rv.size() - prefix.size()};
	auto const *p{rv.data()};
	auto const *e{p + rv.size()};
	auto const *dash{p};
	while (dash != e && *dash != u8'-')
	{
		++dash;
	}
	if (dash == e || (dash == p && dash + 1 == e))
	{
		return {}; /* "bytes=-" or no dash — nothing usable, ignore */
	}
	auto const field{
		[](char8_t const *f, char8_t const *l, ::std::uint_least64_t &v) throws {
			auto const [it, ec] = ::fast_io::parse_by_scan(f, l, v);
			if (ec != ::fast_io::freestanding::parse_errc::ok || it != l)
			{
				::fast_io::herbceptions::throws_parse_errc(
					::fast_io::freestanding::parse_errc::invalid);
			}
		}};
	if (size == 0)
	{
		::fast_io::herbceptions::throws_parse_errc(
			::fast_io::freestanding::parse_errc::invalid);
	}
	::std::uint_least64_t s{}, n{};
	if (dash == p)
	{
		/* suffix form "-n": the last n bytes */
		field(dash + 1, e, n);
		if (n == 0)
		{
			::fast_io::herbceptions::throws_parse_errc(
				::fast_io::freestanding::parse_errc::invalid);
		}
		if (n > size)
		{
			n = size;
		}
		return {.start = size - n, .length = n, .present = true};
	}
	field(p, dash, s);
	if (s >= size)
	{
		::fast_io::herbceptions::throws_parse_errc(
			::fast_io::freestanding::parse_errc::invalid);
	}
	::std::uint_least64_t endv{size - 1};
	if (dash + 1 != e)
	{
		field(dash + 1, e, endv);
	}
	if (endv >= size)
	{
		endv = size - 1;
	}
	if (s > endv)
	{
		::fast_io::herbceptions::throws_parse_errc(
			::fast_io::freestanding::parse_errc::invalid);
	}
	return {.start = s, .length = endv - s + 1, .present = true};
}

/* --------------------------- responders --------------------------- */

/*
 * Every responder ends with an explicit flush: on the keep-alive path
 * the next scan's tie would flush anyway, but a "Connection: close"
 * response must be on the wire before the socket dies.
 */

static fi::io_async_task<>
respond_status(fi::io_async_observer sched, fi::u8iobuf_socket_file &sock,
			   unsigned code, fi::u8string_view phrase, http_request const &req,
			   server_cfg const &cfg) throws
{
	fi::u8string const body{fi::u8concat_fast_io(
		u8"<!doctype html><title>", code, u8" ", phrase, u8"</title><h1>", code,
		u8" ", phrase, u8"</h1><hr><i>http-server (fast_io)</i>")};
	co_await fi::io::async_print(
		sched, {}, sock, u8"HTTP/1.1 ", code, u8" ", phrase,
		code == 405 ? fi::u8string_view{u8"\r\nAllow: GET, HEAD"}
					: fi::u8string_view{},
		u8"\r\nContent-Type: text/html\r\nContent-Length: ", body.size(),
		u8"\r\nConnection: ",
		req.keep_alive ? fi::u8string_view{u8"keep-alive"}
					   : fi::u8string_view{u8"close"},
		fi::u8string_view{cfg.cors_block.data(), cfg.cors_block.size()},
		u8"\r\n\r\n");
	if (!req.head_only)
	{
		co_await fi::io::async_print(sched, {}, sock,
									 fi::u8string_view{body.data(), body.size()});
	}
	co_await fop::async_output_stream_flush(sched, {}, sock);
}

/* showDir: plain href-per-line listing — no icons, no perms columns.
 * dirat is the at-entry of the directory being listed. */
static fi::io_async_task<>
respond_listing(fi::io_async_observer sched, fi::u8iobuf_socket_file &sock,
				fi::u8string_view url_path, fi::native_at_entry dirat,
				server_cfg const &cfg, http_request const &req) throws
{
	fi::u8string page;
	{
		fi::u8ostring_ref_fast_io w{__builtin_addressof(page)};
		fi::io::print(w,
					  u8"<!doctype html><meta charset=\"utf-8\"><title>Index of ",
					  fi::u8string_view{url_path}, u8"</title><h1>Index of ",
					  fi::u8string_view{url_path}, u8"</h1><hr><pre>\n");
		try
		{
			for (auto const &ent : fi::current(dirat))
			{
				if (fi::is_dot(ent))
				{
					continue;
				}
				auto const name{fi::u8filename(ent)};
				bool const isdir{fi::type(ent) == fi::file_type::directory};
				fi::io::print(w, u8"<a href=\"");
				for (auto c : fi::u8string_view{name.data(), name.size()})
				{
					if ((u8'a' <= c && c <= u8'z') || (u8'A' <= c && c <= u8'Z') ||
						(u8'0' <= c && c <= u8'9') || c == u8'-' || c == u8'_' ||
						c == u8'.' || c == u8'~')
					{
						fi::io::print(w, ::fast_io::mnp::chvw(c));
					}
					else
					{
						fi::io::print(w, ::fast_io::mnp::chvw(u8'%'),
									  ::fast_io::mnp::hexupper<false, true>(c));
					}
				}
				fi::io::print(w, isdir ? fi::u8string_view{u8"/\">"}
									   : fi::u8string_view{u8"\">"});
				for (auto c : fi::u8string_view{name.data(), name.size()})
				{
					switch (c)
					{
					case u8'&':
						fi::io::print(w, u8"&amp;");
						break;
					case u8'<':
						fi::io::print(w, u8"&lt;");
						break;
					case u8'>':
						fi::io::print(w, u8"&gt;");
						break;
					case u8'"':
						fi::io::print(w, u8"&quot;");
						break;
					default:
						fi::io::print(w, ::fast_io::mnp::chvw(c));
					}
				}
				fi::io::print(w, isdir ? fi::u8string_view{u8"/</a>\n"}
									   : fi::u8string_view{u8"</a>\n"});
			}
		}
		catch throws(::std::error)
		{
		}
		fi::io::print(w, u8"</pre><hr><i>http-server (fast_io)</i>");
	}
	co_await fi::io::async_print(
		sched, {}, sock,
		u8"HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n",
		u8"Content-Length: ", page.size(), u8"\r\nCache-Control: max-age=",
		cfg.cache_seconds, u8"\r\nConnection: ",
		req.keep_alive ? fi::u8string_view{u8"keep-alive"}
					   : fi::u8string_view{u8"close"},
		fi::u8string_view{cfg.cors_block.data(), cfg.cors_block.size()},
		u8"\r\n\r\n");
	if (!req.head_only)
	{
		co_await fi::io::async_print(sched, {}, sock,
									 fi::u8string_view{page.data(), page.size()});
	}
	co_await fop::async_output_stream_flush(sched, {}, sock);
}

/*
 * regular file — the serve() half of node's middleware: conditional
 * headers, a single byte range, HEAD, then the body rides
 * async_transmit_all straight from the file fd to the socket. The
 * stream is templated because the file handle arrives as either a
 * u8native_file or (on win32) a dir-mode handle that turned out to be
 * a regular file; only the transmit call site needs the concrete type.
 */
template <typename stmtype>
static fi::io_async_task<>
respond_file(fi::io_async_observer sched, fi::u8iobuf_socket_file &sock,
			 stmtype &file, fi::posix_file_status const &st,
			 http_request const &req, fi::u8string_view reqname,
			 server_cfg const &cfg) throws
{
	fi::u8string_view const type{mime_type_of(reqname)};
	/* node etag: "ino-size-mtime"; same shape, unix time for the mtime */
	fi::u8string const etag{fi::u8concat_fast_io(u8"\"", st.ino, u8"-", st.size,
												 u8"-", st.mtim.tv_sec, u8".",
												 st.mtim.tv_nsec, u8"\"")};
	fi::u8string const lastmod{imf_date(st.mtim.tv_sec)};
	fi::u8string_view const connv{req.keep_alive
									  ? fi::u8string_view{u8"keep-alive"}
									  : fi::u8string_view{u8"close"}};

	/* If-None-Match: any list member may match, weak prefix allowed */
	bool not_modified{};
	fi::u8string_view const ev{etag.data(), etag.size()};
	{
		auto const *i{req.inm.data()};
		auto const *e{i + req.inm.size()};
		for (; i != e && !not_modified;)
		{
			while (i != e && (*i == u8' ' || *i == u8','))
			{
				++i;
			}
			auto const *j{i};
			while (j != e && *j != u8',')
			{
				++j;
			}
			auto const *k{j};
			while (k != i && k[-1] == u8' ')
			{
				--k;
			}
			fi::u8string_view cand{i, static_cast<::std::size_t>(k - i)};
			if (cand.size() >= 2 && cand.data()[0] == u8'W' &&
				cand.data()[1] == u8'/')
			{
				cand = fi::u8string_view{cand.data() + 2, cand.size() - 2};
			}
			not_modified = cand == ev || cand == fi::u8string_view{u8"*"};
			i = j;
		}
	}
	if (!not_modified && !req.ims.empty())
	{
		try
		{
			not_modified = parse_imf_date(req.ims) >= st.mtim.tv_sec;
		}
		catch throws(::std::error)
		{
		}
	}
	if (not_modified)
	{
		co_await fi::io::async_print(
			sched, {}, sock, u8"HTTP/1.1 304 Not Modified\r\nETag: ", ev,
			u8"\r\nConnection: ", connv,
			fi::u8string_view{cfg.cors_block.data(), cfg.cors_block.size()},
			u8"\r\n\r\n");
		co_await fop::async_output_stream_flush(sched, {}, sock);
		co_return;
	}

	range_result rng{};
	bool bad_range{};
	try
	{
		rng = parse_range(req.range, st.size);
	}
	catch throws(::std::error)
	{
		bad_range = true;
	}
	if (bad_range)
	{
		co_await fi::io::async_print(
			sched, {}, sock,
			u8"HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */",
			st.size, u8"\r\nContent-Length: 0\r\nConnection: ", connv,
			fi::u8string_view{cfg.cors_block.data(), cfg.cors_block.size()},
			u8"\r\n\r\n");
		co_await fop::async_output_stream_flush(sched, {}, sock);
		co_return;
	}
	/*
	 * If-Range: a validator that doesn't match downgrades the 206 to a
	 * full 200 — video clients send it so a changed file isn't resumed
	 * mid-byte. ETag form wins; otherwise it's an HTTP date.
	 */
	if (rng.present && !req.if_range.empty())
	{
		fi::u8string_view iv{req.if_range};
		bool match;
		if (!iv.empty() && iv.data()[0] == u8'"')
		{
			match = iv == ev;
		}
		else if (iv.size() >= 2 && iv.data()[0] == u8'W' &&
				 iv.data()[1] == u8'/')
		{
			match = fi::u8string_view{iv.data() + 2, iv.size() - 2} == ev;
		}
		else
		{
			try
			{
				match = parse_imf_date(iv) >= st.mtim.tv_sec;
			}
			catch throws(::std::error)
			{
				match = false;
			}
		}
		if (!match)
		{
			rng.present = false;
		}
	}
	auto const length{rng.present ? rng.length : st.size};

	co_await fi::io::async_print(
		sched, {}, sock,
		rng.present ? fi::u8string_view{u8"HTTP/1.1 206 Partial Content\r\n"}
					: fi::u8string_view{u8"HTTP/1.1 200 OK\r\n"},
		u8"Content-Type: ", type,
		mime_is_text(type) ? fi::u8string_view{u8"; charset=utf-8"}
						   : fi::u8string_view{},
		u8"\r\nAccept-Ranges: bytes\r\nCache-Control: max-age=",
		cfg.cache_seconds, u8"\r\nLast-Modified: ",
		fi::u8string_view{lastmod.data(), lastmod.size()}, u8"\r\nETag: ", ev,
		rng.present
			? fi::u8concat_fast_io(u8"\r\nContent-Range: bytes ", rng.start,
								   u8"-", rng.start + length - 1, u8"/", st.size)
			: fi::u8string{},
		u8"\r\nContent-Length: ", length, u8"\r\nConnection: ", connv,
		fi::u8string_view{cfg.cors_block.data(), cfg.cors_block.size()},
		u8"\r\n\r\n");
	if (!req.head_only && length != 0)
	{
		::fast_io::intfpos_t const off{
			static_cast<::fast_io::intfpos_t>(rng.start)};
		co_await fop::async_transmit_all_bytes(sched, {}, sock, {}, file,
											   ::fast_io::intfpos_opt{off, true},
											   fi::size_t_opt{length});
	}
	co_await fop::async_output_stream_flush(sched, {}, sock);
}

/* directory: trailing-slash redirect, index.html, then the listing.
 * dirat is the directory's own at-entry — index.html is opened relative
 * to it, and the listing iterates it. */
static fi::io_async_task<>
respond_directory(fi::io_async_observer sched, fi::u8iobuf_socket_file &sock,
				  http_request const &req, fi::u8string_view url_path,
				  fi::native_at_entry dirat, server_cfg const &cfg,
				  bool trailing_slash) throws
{
	if (!trailing_slash)
	{
		/* node: Location = pathname + '/' + '?query' — url_path is the
		 * raw target, so the '/' has to go in BEFORE the '?' or the
		 * query swallows it and the redirect loops forever */
		::std::size_t qpos{url_path.size()};
		for (::std::size_t i{}; i != url_path.size(); ++i)
		{
			auto const ch{url_path.data()[i]};
			if (ch == u8'?' || ch == u8'#')
			{
				qpos = i;
				break;
			}
		}
		co_await fi::io::async_print(
			sched, {}, sock, u8"HTTP/1.1 302 Found\r\nLocation: ",
			fi::u8string_view{url_path.data(), qpos}, u8"/",
			fi::u8string_view{url_path.data() + qpos, url_path.size() - qpos},
			u8"\r\nContent-Length: 0\r\nConnection: ",
			req.keep_alive ? fi::u8string_view{u8"keep-alive"}
						   : fi::u8string_view{u8"close"},
			fi::u8string_view{cfg.cors_block.data(), cfg.cors_block.size()},
			u8"\r\n\r\n");
		co_await fop::async_output_stream_flush(sched, {}, sock);
		co_return;
	}
	if (cfg.autoindex)
	{
		try
		{
			fi::u8native_file idxf{dirat, fi::u8cstring_view{u8"index.html"},
								   fi::open_mode::in};
			auto const st{fi::status(idxf)};
			if (st.type == fi::file_type::regular)
			{
				co_await respond_file(sched, sock, idxf, st, req,
									  fi::u8string_view{u8"index.html"}, cfg);
				co_return;
			}
		}
		catch throws(::std::error)
		{
		}
	}
	if (cfg.showdir)
	{
		co_await respond_listing(sched, sock, url_path, dirat, cfg, req);
		co_return;
	}
	co_await respond_status(sched, sock, 404, u8"Not Found", req, cfg);
}

/* comma-list header token match — Connection: keep-alive, Upgrade */
static bool has_token(fi::u8string_view list, fi::u8string_view tok) noexcept
{
	for (::std::size_t off{}; off < list.size();)
	{
		::std::size_t comma{list.size()};
		for (::std::size_t i{off}; i != list.size(); ++i)
		{
			if (list[i] == char8_t{','})
			{
				comma = i;
				break;
			}
		}
		auto seg{fi::u8string_view{list.data() + off, comma - off}};
		while (!seg.empty() &&
			   (seg.front() == char8_t{' '} || seg.front() == char8_t{'\t'}))
		{
			seg.remove_prefix(1);
		}
		while (!seg.empty() &&
			   (seg.back() == char8_t{' '} || seg.back() == char8_t{'\t'}))
		{
			seg.remove_suffix(1);
		}
		if (ascii_ieq(seg, tok))
		{
			return true;
		}
		off = comma == list.size() ? list.size() : comma + 1;
	}
	return false;
}

/* --------------------------- cors bypass proxy --------------------- */

/*
 * Forward proxy: a request whose target is /http://host/path or
 * /https://host/path is fetched upstream and relayed with CORS headers
 * injected. Same URL form as cors-bypass/server.js.
 *
 * HLS correctness rules, deliberately stricter than the js original:
 * - Connection: close upstream — every proxied request owns a fresh
 *   socket, so a response can NEVER be bound to a different request.
 *   Reused upstream connections are how a stale playlist ends up
 *   streamed to a client that asked for the fresh one.
 * - nothing is cached — every manifest hits the origin.
 * - relative URIs inside a manifest resolve against the URL of the
 *   response being rewritten (post-redirect), computed in this frame.
 * - manifest responses force Cache-Control: no-store so the browser
 *   can't hold a stale playlist either.
 */

struct proxy_url
{
	bool https{};
	fi::u8string_view authority{}; /* host[:port] verbatim — the Host header */
	fi::u8string_view name{};      /* dns/hostname part only */
	fi::u8string_view path{u8"/"}; /* path + query */
	::std::uint_least16_t port{};
};

static bool is_proxy_target(fi::u8string_view t) noexcept
{
	return t.size() > 8 &&
		   (fi::u8string_view{t.data(), 8} == fi::u8string_view{u8"/http://"} ||
			fi::u8string_view{t.data(), 9} == fi::u8string_view{u8"/https://"});
}

/* "<scheme>://<authority><path>" — bare url, no leading slash */
static bool parse_proxy_target(fi::u8string_view target,
							   proxy_url &u) noexcept
{
	auto rest{target};
	if (rest.size() > 7 &&
		fi::u8string_view{rest.data(), 7} == fi::u8string_view{u8"http://"})
	{
		rest.remove_prefix(7);
		u.https = false;
		u.port = 80;
	}
	else if (rest.size() > 8 && fi::u8string_view{rest.data(), 8} ==
									fi::u8string_view{u8"https://"})
	{
		rest.remove_prefix(8);
		u.https = true;
		u.port = 443;
	}
	else
	{
		return false;
	}
	::std::size_t auth_end{rest.size()};
	for (::std::size_t i{}; i != rest.size(); ++i)
	{
		if (rest[i] == char8_t{'/'})
		{
			auth_end = i;
			break;
		}
	}
	u.authority = fi::u8string_view{rest.data(), auth_end};
	if (auth_end != rest.size())
	{
		u.path = fi::u8string_view{rest.data() + auth_end, rest.size() - auth_end};
	}
	/* authority = name[:port] — the last ':' splits, ipv6 literals are
	 * bracketed so a bare colon inside [] doesn't count */
	::std::size_t colon{auth_end};
	bool bracketed{};
	for (::std::size_t i{}; i != auth_end; ++i)
	{
		if (rest[i] == char8_t{'['})
		{
			bracketed = true;
		}
		else if (rest[i] == char8_t{']'})
		{
			bracketed = false;
		}
		else if (rest[i] == char8_t{':'} && !bracketed)
		{
			colon = i;
		}
	}
	u.name = fi::u8string_view{rest.data(), colon};
	if (u.name.empty())
	{
		return false;
	}
	if (colon != auth_end)
	{
		::std::uint_least32_t p{};
		for (::std::size_t i{colon + 1}; i != auth_end; ++i)
		{
			auto const c{rest[i]};
			if (c < char8_t{'0'} || c > char8_t{'9'})
			{
				return false;
			}
			p = p * 10 + (c - char8_t{'0'});
			if (p > 65535)
			{
				return false;
			}
		}
		u.port = static_cast<::std::uint_least16_t>(p);
	}
	return true;
}

/* minimal rfc3986 relative resolution for manifest + redirect targets */
static fi::u8string resolve_url(fi::u8string_view base, fi::u8string_view rel)
{
	if (rel.size() > 8 &&
		(fi::u8string_view{rel.data(), 7} == fi::u8string_view{u8"http://"} ||
		 fi::u8string_view{rel.data(), 8} == fi::u8string_view{u8"https://"}))
	{
		return fi::u8string{rel};
	}
	/* origin = scheme://authority */
	::std::size_t after_scheme{};
	for (::std::size_t i{}; i + 2 < base.size(); ++i)
	{
		if (base[i] == char8_t{':'} && base[i + 1] == char8_t{'/'} &&
			base[i + 2] == char8_t{'/'})
		{
			after_scheme = i + 3;
			break;
		}
	}
	::std::size_t origin_end{base.size()};
	for (::std::size_t i{after_scheme}; i != base.size(); ++i)
	{
		if (base[i] == char8_t{'/'})
		{
			origin_end = i;
			break;
		}
	}
	if (rel.size() > 1 && rel[0] == char8_t{'/'} && rel[1] == char8_t{'/'})
	{
		/* "//host/path" — keep the base's scheme */
		fi::u8string out{fi::u8string_view{base.data(), after_scheme - 2}};
		out.append(fi::u8string_view{rel.data() + 1, rel.size() - 1});
		return out;
	}
	if (!rel.empty() && rel[0] == char8_t{'/'})
	{
		fi::u8string out{fi::u8string_view{base.data(), origin_end}};
		out.append(rel);
		return out;
	}
	/* relative to the base's directory */
	::std::size_t last_slash{origin_end};
	for (::std::size_t i{base.size()}; i != after_scheme; --i)
	{
		if (base[i - 1] == char8_t{'/'})
		{
			last_slash = i - 1;
			break;
		}
	}
	fi::u8string out{fi::u8string_view{base.data(), last_slash + 1}};
	out.append(rel);
	return out;
}

/* does this upstream response carry an mpegurl body we should rewrite */
static bool is_manifest(fi::u8string_view content_type,
						fi::u8string_view path) noexcept
{
	fi::u8string_view const tag{u8"mpegurl"};
	if (content_type.size() >= tag.size())
	{
		for (::std::size_t i{}; i + tag.size() <= content_type.size(); ++i)
		{
			if (fi::u8string_view{content_type.data() + i, tag.size()} == tag)
			{
				return true;
			}
		}
	}
	::std::size_t plen{path.size()};
	for (::std::size_t i{}; i != path.size(); ++i)
	{
		if (path[i] == char8_t{'?'})
		{
			plen = i;
			break;
		}
	}
	return (plen > 5 && fi::u8string_view{path.data() + plen - 5, 5} ==
							fi::u8string_view{u8".m3u8"}) ||
		   (plen > 4 && fi::u8string_view{path.data() + plen - 4, 4} ==
							fi::u8string_view{u8".m3u"});
}

/* every absolute and resolvable-relative url inside the manifest is
 * rewritten to /<absolute-url> so the client's next request comes back
 * through us — that is what keeps segment fetches under the bypass */
static fi::u8string rewrite_manifest(fi::u8string_view content,
									 fi::u8string_view base_url,
									 fi::u8string_view bypass_base)
{
	fi::u8string out;
	out.reserve(content.size() + 64);
	for (::std::size_t off{}; off <= content.size();)
	{
		::std::size_t eol{content.size()};
		for (::std::size_t i{off}; i != content.size(); ++i)
		{
			if (content[i] == char8_t{'\n'})
			{
				eol = i;
				break;
			}
		}
		if (eol == content.size() && off == content.size())
		{
			break;
		}
		auto line{fi::u8string_view{content.data() + off, eol - off}};
		if (!line.empty() && line.back() == char8_t{'\r'})
		{
			line.remove_suffix(1);
		}
		::std::size_t first{};
		while (first != line.size() &&
			   (line[first] == char8_t{' '} || line[first] == char8_t{'\t'}))
		{
			++first;
		}
		if (first != line.size() && line[first] != char8_t{'#'})
		{
			auto seg{fi::u8string_view{line.data() + first, line.size() - first}};
			out.append(bypass_base);
			out.append(resolve_url(base_url, seg));
		}
		else if (first != line.size())
		{
			/* #EXT-X-KEY:URI="..." style — rewrite the quoted value */
			::std::size_t pos{first};
			for (;;)
			{
				::std::size_t uri{line.size()};
				for (::std::size_t i{pos}; i + 4 < line.size(); ++i)
				{
					if (line[i] == char8_t{'U'} && line[i + 1] == char8_t{'R'} &&
						line[i + 2] == char8_t{'I'} && line[i + 3] == char8_t{'='} &&
						line[i + 4] == char8_t{'"'})
					{
						uri = i;
						break;
					}
				}
				if (uri == line.size())
				{
					out.append(fi::u8string_view{line.data() + pos, line.size() - pos});
					break;
				}
				::std::size_t close{line.size()};
				for (::std::size_t i{uri + 5}; i != line.size(); ++i)
				{
					if (line[i] == char8_t{'"'})
					{
						close = i;
						break;
					}
				}
				out.append(fi::u8string_view{line.data() + pos, uri + 5 - pos});
				out.append(bypass_base);
				out.append(
					resolve_url(base_url, fi::u8string_view{line.data() + uri + 5,
															close - uri - 5}));
				pos = close;
			}
		}
		else
		{
			out.append(line);
		}
		if (eol != content.size())
		{
			out.push_back(char8_t{'\n'});
		}
		off = eol + 1;
	}
	return out;
}

/* ACAO block for bypass responses — origin echo when present, else '*' */
static fi::u8string bypass_cors_block(fi::u8string_view origin)
{
	fi::u8string b{u8"Access-Control-Allow-Origin: "};
	b.append(origin.empty() ? fi::u8string_view{u8"*"} : origin);
	b.append(u8"\r\nAccess-Control-Allow-Methods: GET, HEAD, OPTIONS");
	b.append(u8"\r\nAccess-Control-Allow-Headers: Content-Type, Authorization, "
			 u8"Range, X-Requested-With");
	b.append(u8"\r\nAccess-Control-Allow-Credentials: true");
	b.append(u8"\r\nAccess-Control-Expose-Headers: Content-Length, "
			 u8"Content-Range, Content-Type");
	return b;
}

/* result of one upstream round-trip */
struct proxy_outcome
{
	enum class kind_t : ::std::uint_least8_t
	{
		done,
		redirect,
		close_client /* upstream was close-terminated; end the client
					  * connection to delimit the body */
	};
	kind_t kind{kind_t::done};
	fi::u8string location;
};

/* headers that must not pass through in either direction */
static bool hop_by_hop(fi::u8string_view k) noexcept
{
	return ascii_ieq(k, u8"connection") || ascii_ieq(k, u8"keep-alive") ||
		   ascii_ieq(k, u8"content-length") ||
		   ascii_ieq(k, u8"transfer-encoding") || ascii_ieq(k, u8"host") ||
		   ascii_ieq(k, u8"te") || ascii_ieq(k, u8"trailer") ||
		   ascii_ieq(k, u8"upgrade") || ascii_ieq(k, u8"accept-encoding");
}

/* read a de-chunked body to EOF-of-framing; trailers are ignored */
template <typename upstream_type>
static fi::io_async_task<> proxy_read_chunked(fi::io_async_observer sched,
											  upstream_type &up,
											  fi::u8string &body) throws
{
	for (;;)
	{
		::std::uint_least64_t n{};
		co_await fi::io::async_scan(sched, {}, up, fi::mnp::hex_get(n),
									fi::mnp::scan_skippers::crlf());
		if (n == 0)
		{
			co_return;
		}
		auto const off{body.size()};
		body.resize(off + n);
		co_await fop::async_pread_all_bytes(
			sched, {}, up, reinterpret_cast<::std::byte *>(body.data()) + off, n,
			{});
		/* the CRLF trailing each chunk body is eaten by the next
		 * hex_get's whitespace skip — same pattern as https.cc */
	}
}

/* forward one upstream response to the client, framing regenerated to
 * match what we actually emit */
template <typename upstream_type>
static fi::io_async_task<>
proxy_relay(fi::io_async_observer sched, fi::u8iobuf_socket_file &client,
			upstream_type &up, fi::u8http_header_buffer const &rhdr,
			fi::u8string_view cors, fi::u8string_view final_url,
			fi::u8string_view bypass_base, bool head_only,
			proxy_outcome &out) throws
{
	auto const st{rhdr.code()};
	fi::u8string_view const code{st.data(), st.size()};
	auto const rs{rhdr.reason()};
	fi::u8string_view const reason{rs.data(), rs.size()};

	fi::u8string_view content_type{}, location{}, cache_control{};
	::std::uint_least64_t content_length{};
	bool has_cl{}, chunked{};
	for (auto [key, value] : fi::line_generator(rhdr))
	{
		fi::u8string_view const k{key.data(), key.size()};
		fi::u8string_view const v{value.data(), value.size()};
		if (ascii_ieq(k, u8"content-length"))
		{
			auto const [it, ec]{
				fi::parse_by_scan(v.data(), v.data() + v.size(), content_length)};
			has_cl =
				ec == fi::freestanding::parse_errc::ok && it == v.data() + v.size();
		}
		else if (ascii_ieq(k, u8"transfer-encoding"))
		{
			chunked = has_token(v, u8"chunked");
		}
		else if (ascii_ieq(k, u8"content-type"))
		{
			content_type = v;
		}
		else if (ascii_ieq(k, u8"location"))
		{
			location = v;
		}
		else if (ascii_ieq(k, u8"cache-control"))
		{
			cache_control = v;
		}
	}

	/* 3xx + Location -> caller re-requests; the body may sit unread —
	 * upstream Connection: close makes that fine */
	if (code.size() == 3 && code[0] == char8_t{'3'} && !location.empty())
	{
		out.kind = proxy_outcome::kind_t::redirect;
		out.location = location;
		co_return;
	}

	/* path part of the final url decides manifest-ness */
	proxy_url fu{};
	parse_proxy_target(final_url, fu); /* reuse parse for the path slice */
	fi::u8string_view const final_path{fu.path};
	auto const manifest{is_manifest(content_type, final_path)};

	co_await fi::io::async_print(sched, {}, client, u8"HTTP/1.1 ", code, u8" ",
								 reason, u8"\r\n");
	for (auto [key, value] : fi::line_generator(rhdr))
	{
		fi::u8string_view const k{key.data(), key.size()};
		if (!hop_by_hop(k) && !ascii_ieq(k, u8"cache-control") &&
			!ascii_ieq(k, u8"access-control-allow-origin") &&
			!ascii_ieq(k, u8"access-control-allow-methods") &&
			!ascii_ieq(k, u8"access-control-allow-headers") &&
			!ascii_ieq(k, u8"access-control-allow-credentials") &&
			!ascii_ieq(k, u8"access-control-expose-headers"))
		{
			co_await fi::io::async_print(sched, {}, client, key, u8": ", value,
										 u8"\r\n");
		}
	}
	if (manifest && cache_control.empty())
	{
		/* a playlist the browser could cache is a stale sequence number
		 * waiting to happen */
		co_await fi::io::async_print(sched, {}, client,
									 u8"Cache-Control: no-store\r\n");
	}

	co_await fi::io::async_print(sched, {}, client, cors, u8"\r\n");

	if (head_only)
	{
		co_await fi::io::async_print(sched, {}, client, u8"\r\n");
		co_await fop::async_output_stream_flush(sched, {}, client);
		co_return;
	}

	if (manifest)
	{
		fi::u8string body;
		if (has_cl)
		{
			body.resize(content_length);
			co_await fop::async_pread_all_bytes(
				sched, {}, up, reinterpret_cast<::std::byte *>(body.data()),
				content_length, {});
		}
		else if (chunked)
		{
			co_await proxy_read_chunked(sched, up, body);
		}
		auto const rewritten{rewrite_manifest(
			fi::u8string_view{body.data(), body.size()}, final_url, bypass_base)};
		co_await fi::io::async_print(sched, {}, client, u8"Content-Length: ",
									 rewritten.size(), u8"\r\n\r\n");
		co_await fi::io::async_print(
			sched, {}, client,
			fi::u8string_view{rewritten.data(), rewritten.size()});
		co_await fop::async_output_stream_flush(sched, {}, client);
		co_return;
	}

	if (has_cl)
	{
		co_await fi::io::async_print(sched, {}, client, u8"Content-Length: ",
									 content_length, u8"\r\n\r\n");

		co_await fop::async_transmit_all_bytes(sched, {}, client, {}, up, {},
											   content_length);

		co_await fop::async_output_stream_flush(sched, {}, client);
	}
	else if (chunked)
	{
		co_await fi::io::async_print(sched, {}, client,
									 u8"Transfer-Encoding: chunked\r\n\r\n");
		for (;;)
		{
			::std::uint_least64_t n{};
			co_await fi::io::async_scan(sched, {}, up, fi::mnp::hex_get(n),
										fi::mnp::scan_skippers::crlf());
			co_await fi::io::async_print(sched, {}, client, fi::mnp::hex(n),
										 u8"\r\n");
			if (n == 0)
			{
				co_await fi::io::async_print(sched, {}, client, u8"\r\n");
				break;
			}
			co_await fop::async_transmit_all_bytes(sched, {}, client, {}, up, {}, n);
			co_await fi::io::async_print(sched, {}, client, u8"\r\n");
		}
		co_await fop::async_output_stream_flush(sched, {}, client);
	}
	else
	{
		/* no length — relay until upstream EOF, then close the client
		 * connection to delimit the body */
		co_await fi::io::async_print(sched, {}, client,
									 u8"Connection: close\r\n\r\n");
		co_await fop::async_transmit_all_bytes(sched, {}, client, {}, up, {}, {});
		co_await fop::async_output_stream_flush(sched, {}, client);
		out.kind = proxy_outcome::kind_t::close_client;
	}
}

/* one upstream round-trip over an already-connected stream */
template <typename upstream_type>
static fi::io_async_task<>
proxy_round_trip(fi::io_async_observer sched, fi::u8iobuf_socket_file &client,
				 upstream_type &up, proxy_url const &u,
				 fi::u8http_header_buffer const &req_hdr,
				 http_request const &req, fi::u8string_view cors,
				 fi::u8string_view final_url, fi::u8string_view bypass_base,
				 proxy_outcome &out) throws
{
	/* request: method + path + Host + the client's headers minus
	 * hop-by-hop; Connection: close pins this socket to ONE response */
	co_await fi::io::async_print(sched, {}, up, req.method, u8" ", u.path,
								 u8" HTTP/1.1\r\nHost: ", u.authority,
								 u8"\r\nAccept-Encoding: identity\r\n"
								 u8"Connection: close\r\n");
	for (auto [key, value] : fi::line_generator(req_hdr))
	{
		fi::u8string_view const k{key.data(), key.size()};
		if (!hop_by_hop(k) && !ascii_ieq(k, u8"origin") &&
			!ascii_ieq(k, u8"referer") && !ascii_ieq(k, u8"sec-fetch-dest") &&
			!ascii_ieq(k, u8"sec-fetch-mode") &&
			!ascii_ieq(k, u8"sec-fetch-site") &&
			!ascii_ieq(k, u8"sec-fetch-user"))
		{
			co_await fi::io::async_print(sched, {}, up, key, u8": ", value, u8"\r\n");
		}
	}
	co_await fi::io::async_print(sched, {}, up, u8"\r\n");
	co_await fop::async_output_stream_flush(sched, {}, up);

	fi::u8http_header_buffer rhdr;
	co_await fi::io::async_scan(sched, {}, up, rhdr);
	co_await proxy_relay(sched, client, up, rhdr, cors, final_url, bypass_base,
						 req.head_only, out);
}

/* GET/HEAD on /http(s)://... — connect, forward, relay, follow
 * redirects internally up to a bound. returns true when the upstream
 * body was close-terminated — the client connection must end too */
static fi::io_async_task<bool>
respond_proxy(fi::io_async_observer sched, fi::u8iobuf_socket_file &client,
			  fi::u8http_header_buffer const &req_hdr,
			  http_request const &req) throws
{
	fi::u8string cur{
		fi::u8string_view{req.target.data() + 1, req.target.size() - 1}};
	fi::u8string_view curv{cur.data(), cur.size()};
	auto const cors_str{bypass_cors_block(req.origin)};
	fi::u8string_view const cors{cors_str.data(), cors_str.size()};
	fi::u8string bypass_base{u8"http://"};
	bypass_base.append(req.host.empty() ? fi::u8string_view{u8"localhost"}
										: req.host);
	bypass_base.push_back(char8_t{'/'});
	fi::u8string_view const bypass_basev{bypass_base.data(), bypass_base.size()};

	for (unsigned depth{}; depth != 10; ++depth)
	{
		proxy_url u{};
		if (!parse_proxy_target(curv, u))
		{
			co_await fi::io::async_print(
				sched, {}, client,
				u8"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n");
			co_await fop::async_output_stream_flush(sched, {}, client);
			co_return false;
		}
		fi::u8string const hostname{u.name};
		fi::ip server{};
		bool resolved{};
		fi::native_dns_file dns{
			fi::mnp::os_c_str(reinterpret_cast<char const *>(hostname.c_str()))};
		for (auto const ent : dns)
		{
			server = fi::to_ip(ent, u.port);
			resolved = true;
			break;
		}
		if (!resolved)
		{
			co_await fi::io::async_print(
				sched, {}, client,
				u8"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n");
			co_await fop::async_output_stream_flush(sched, {}, client);
			co_return false;
		}
		proxy_outcome out{};
		if (u.https)
		{
			fi::tls::u8iobuf_native_tls_socket_file ups{
				fi::tcp_connect(server, fi::open_mode::no_block)};
			fop::handshake(ups.handle,
						   fi::u8cstring_view{fi::mnp::os_c_str(hostname.c_str())});
			co_await proxy_round_trip(sched, client, ups, u, req_hdr, req, cors, curv,
									  bypass_basev, out);
		}
		else
		{
			fi::u8iobuf_socket_file ups{fi::u8native_socket_file{
				fi::tcp_connect(server, fi::open_mode::no_block)}};
			co_await proxy_round_trip(sched, client, ups, u, req_hdr, req, cors, curv,
									  bypass_basev, out);
		}
		if (out.kind == proxy_outcome::kind_t::redirect)
		{
			cur = resolve_url(
				curv, fi::u8string_view{out.location.data(), out.location.size()});
			curv = fi::u8string_view{cur.data(), cur.size()};
			continue;
		}
		co_return out.kind == proxy_outcome::kind_t::close_client;
	}
	co_await fi::io::async_print(
		sched, {}, client,
		u8"HTTP/1.1 508 Loop Detected\r\nContent-Length: 0\r\n\r\n");
	co_await fop::async_output_stream_flush(sched, {}, client);
	co_return false;
}

/* ------------------------------ websocket ------------------------- */

static bool is_ws_upgrade(http_request const &req) noexcept
{
	return req.method == fi::u8string_view{u8"GET"} &&
		   ascii_ieq(req.upgrade, u8"websocket") &&
		   has_token(req.connection, u8"upgrade") && !req.wskey.empty() &&
		   req.wsver == fi::u8string_view{u8"13"};
}

/* one ws frame out: encoded header + payload in a single scatter op —
 * the server direction is never masked */
static fi::io_async_task<> ws_send_frame(fi::io_async_observer sched,
										 fi::u8iobuf_socket_file &sock,
										 bool fin, fi::websocket_opcode op,
										 ::std::byte const *data,
										 ::std::size_t len) throws
{
	::std::byte hdrbytes[10];
	auto const hn{fi::websocket_encode_frame_header(hdrbytes, fin, op, len)};
	fi::io_scatter_t const sc[]{{hdrbytes, hn}, {data, len}};
	co_await fop::async_scatter_pwrite_all_bytes(sched, {}, sock, sc, 2, {});
}

/*
 * rfc6455 session after the 101: echo data frames back verbatim
 * (continuation frames pass through — the peer sees the same
 * fragmentation shape), ping -> pong with the same payload, close ->
 * answer close and end. Clients MUST mask; an unmasked frame and an
 * oversized frame get a protocol close instead of a silent accept.
 */
static fi::io_async_task<> ws_session(fi::io_async_observer sched,
									  fi::u8iobuf_socket_file &sock,
									  http_request const &req) throws
{
	char8_t accept[fi::websocket_accept_key_size];
	fi::websocket_accept_key(accept, req.wskey.data(), req.wskey.size());
	co_await fi::io::async_print(
		sched, {}, sock,
		u8"HTTP/1.1 101 Switching Protocols\r\n"
		u8"Upgrade: websocket\r\n"
		u8"Connection: Upgrade\r\n"
		u8"Sec-WebSocket-Accept: ",
		fi::u8string_view{accept, fi::websocket_accept_key_size}, u8"\r\n\r\n");
	co_await fop::async_output_stream_flush(sched, {}, sock);

	constexpr ::std::size_t max_payload{16u << 20};
	fi::u8string payload;
	for (;;)
	{
		fi::websocket_frame_header fh{};
		co_await fi::io::async_scan(sched, {}, sock,
									fi::mnp::websocket_frame_header_get(fh));
		if (!fh.mask || fh.payload_length > max_payload)
		{
			::std::uint_least16_t const code{
				static_cast<::std::uint_least16_t>(!fh.mask ? 1002 : 1009)};
			::std::byte const reason[2]{static_cast<::std::byte>(code >> 8),
										static_cast<::std::byte>(code)};
			co_await ws_send_frame(sched, sock, true, fi::websocket_opcode::close,
								   reason, 2);
			co_return;
		}
		payload.resize(fh.payload_length);
		auto const pdata{reinterpret_cast<::std::byte *>(payload.data())};
		co_await fop::async_pread_all_bytes(sched, {}, sock, pdata, payload.size(),
											{});
		fi::websocket_apply_mask(pdata, payload.size(), fh.mask_key);
		switch (fh.opcode)
		{
		case fi::websocket_opcode::text:
		case fi::websocket_opcode::binary:
		case fi::websocket_opcode::continuation:
			co_await ws_send_frame(sched, sock, fh.fin, fh.opcode, pdata,
								   payload.size());
			break;
		case fi::websocket_opcode::ping:
			co_await ws_send_frame(sched, sock, true, fi::websocket_opcode::pong,
								   pdata, payload.size());
			break;
		case fi::websocket_opcode::close:
			co_await ws_send_frame(sched, sock, true, fi::websocket_opcode::close,
								   pdata, payload.size());
			co_return;
		default: /* pong — ignore */
			break;
		}
	}
}

/* ------------------------------- core ----------------------------- */

/*
 * One detached coroutine per connection: scan the request head, resolve
 * the path under root, respond, loop for keep-alive. Errors — client
 * disconnect, malformed headers, write failures — all throw into the
 * detached frame and destroy it; there is nobody to report to.
 */
static fi::io_async_task<> session(fi::io_async_observer sched,
								   fi::u8iobuf_socket_file sock,
								   server_cfg cfg) throws
{
	/* LNA gate: space-cap mode checks the peer's address space; the
	 * allow-list mode (--lna with a literal/hostname) matches the peer
	 * address exactly — checked once since the peer never changes */
	{
		auto const peer{fi::getpeername(sock.handle).address};
		bool allowed{cfg.allowed_peers.is_empty()};
		if (allowed)
		{
			allowed = fi::lna_allows(peer, cfg.lna_max);
		}
		else
		{
			for (auto const &ent : cfg.allowed_peers)
			{
				if (fi::lna_peer_eq(peer, ent))
				{
					allowed = true;
					break;
				}
			}
		}
		if (!allowed)
		{
			http_request denied{};
			denied.keep_alive = false;
			co_await respond_status(sched, sock, 403, u8"Forbidden", denied, cfg);
			co_return;
		}
	}
	for (;;)
	{
		fi::u8http_header_buffer hdr{};
		co_await fi::io::async_scan(sched, {}, sock, hdr);

		http_request req;
		auto const m{hdr.request()};
		auto const c{hdr.code()};
		auto const r{hdr.reason()};
		req.method = fi::u8string_view{m.data(), m.size()};
		req.target = fi::u8string_view{c.data(), c.size()};
		req.version = fi::u8string_view{r.data(), r.size()};
		req.head_only = req.method == fi::u8string_view{u8"HEAD"};
		bool const get{req.method == fi::u8string_view{u8"GET"}};
		for (auto [key, value] : line_generator(hdr))
		{
			fi::u8string_view const k{key.data(), key.size()};
			fi::u8string_view const v{value.data(), value.size()};
			if (ascii_ieq(k, u8"connection"))
			{
				req.connection = v;
			}
			else if (ascii_ieq(k, u8"range"))
			{
				req.range = v;
			}
			else if (ascii_ieq(k, u8"if-none-match"))
			{
				req.inm = v;
			}
			else if (ascii_ieq(k, u8"if-modified-since"))
			{
				req.ims = v;
			}
			else if (ascii_ieq(k, u8"if-range"))
			{
				req.if_range = v;
			}
			else if (ascii_ieq(k, u8"upgrade"))
			{
				req.upgrade = v;
			}
			else if (ascii_ieq(k, u8"sec-websocket-key"))
			{
				req.wskey = v;
			}
			else if (ascii_ieq(k, u8"sec-websocket-version"))
			{
				req.wsver = v;
			}
			else if (ascii_ieq(k, u8"host"))
			{
				req.host = v;
			}
			else if (ascii_ieq(k, u8"origin"))
			{
				req.origin = v;
			}
		}
		req.keep_alive = req.version == fi::u8string_view{u8"HTTP/1.0"}
							 ? ascii_ieq(req.connection, u8"keep-alive")
							 : !ascii_ieq(req.connection, u8"close");

		bool const options{req.method == fi::u8string_view{u8"OPTIONS"}};
		if (options && (cfg.cors || (cfg.bypass && is_proxy_target(req.target))))
		{
			/* node's handleOptionsMethod / the js bypass's preflight:
			 * a bare 200 carrying the CORS headers — the bypass set is
			 * generated per-request so it can echo Origin */
			if (cfg.cors_block.empty())
			{
				/* bypass mode — the cors set is generated per-request so
				 * it can echo Origin */
				auto const ob{bypass_cors_block(req.origin)};
				co_await fi::io::async_print(
					sched, {}, sock,
					u8"HTTP/1.1 200 OK\r\nAccess-Control-Allow-Methods: GET, HEAD, "
					u8"OPTIONS\r\n"
					u8"Content-Length: 0\r\nConnection: ",
					req.keep_alive ? fi::u8string_view{u8"keep-alive"}
								   : fi::u8string_view{u8"close"},
					u8"\r\n", fi::u8string_view{ob.data(), ob.size()}, u8"\r\n\r\n");
			}
			else
			{
				co_await fi::io::async_print(
					sched, {}, sock,
					u8"HTTP/1.1 200 OK\r\nAccess-Control-Allow-Methods: GET, HEAD, "
					u8"OPTIONS\r\n"
					u8"Content-Length: 0\r\nConnection: ",
					req.keep_alive ? fi::u8string_view{u8"keep-alive"}
								   : fi::u8string_view{u8"close"},
					fi::u8string_view{cfg.cors_block.data(), cfg.cors_block.size()},
					u8"\r\n\r\n");
			}
			co_await fop::async_output_stream_flush(sched, {}, sock);
		}
		else if (!get && !req.head_only)
		{
			co_await respond_status(sched, sock, 405, u8"Method Not Allowed", req,
									cfg);
		}
		else if (cfg.bypass && is_proxy_target(req.target))
		{
			/* /<scheme>://... — the bypass owns the round-trip; a
			 * close-terminated upstream body ends the client
			 * connection too */
			bool close_client{};
			try
			{
				close_client = co_await respond_proxy(sched, sock, hdr, req);
			}
			catch throws(::std::error e)
			{
				fi::io::perrln("proxy: ", e);
				co_return;
			}
			if (close_client)
			{
				co_return;
			}
		}
		else if (!cfg.http)
		{
			/* file serving is off without --server — the bypass is the
			 * only thing this connection can do */
			co_await respond_status(sched, sock, 404, u8"Not Found", req, cfg);
		}
		else if (is_ws_upgrade(req))
		{
			/* the connection switches protocols — ws_session owns it
			 * from here and the request loop ends */
			co_await ws_session(sched, sock, req);
			co_return;
		}
		else
		{
			fi::u8string rel;
			bool trailing_slash{};
			if (!decode_target(req.target, rel, trailing_slash))
			{
				co_await respond_status(sched, sock, 400, u8"Bad Request", req, cfg);
			}
			else if (rel.empty())
			{
				/* "/" — the root handle itself is the directory */
				co_await respond_directory(sched, sock, req, req.target, cfg.root, cfg,
										   trailing_slash);
			}
			else
			{
				bool failed{};
				try
				{
					auto const relc{fi::mnp::os_c_str(rel.c_str())};
					/* one fstatat decides the branch; symlink_nofollow
					 * would diverge from node's fs.stat, so flags stay 0 */
					auto const st{
						fi::native_fstatat(cfg.root, relc, fi::native_at_flags{})};
					if (st.type == fi::file_type::directory)
					{
						fi::u8native_file df{cfg.root, relc,
											 fi::open_mode::in | fi::open_mode::directory};
						co_await respond_directory(sched, sock, req, req.target, fi::at(df),
												   cfg, trailing_slash);
					}
					else if (st.type == fi::file_type::regular)
					{
						fi::u8native_file f{cfg.root, relc, fi::open_mode::in};
						co_await respond_file(sched, sock, f, st, req,
											  fi::u8string_view{rel.data(), rel.size()},
											  cfg);
					}
					else
					{
						co_await respond_status(sched, sock, 403, u8"Forbidden", req, cfg);
					}
				}
				catch throws(::std::error)
				{
					failed = true;
				}
				if (failed)
				{
					/* ENOENT/ENOTDIR/EACCES all collapse to 404 — node's
					 * effectively404 counts unreadable too. (co_await
					 * can't live inside the catch itself) */
					co_await respond_status(sched, sock, 404, u8"Not Found", req, cfg);
				}
			}
		}
		if (!req.keep_alive)
		{
			co_return;
		}
	}
}

static fi::io_async_task<> accept_loop(fi::io_async_observer sched,
									   fi::u8native_socket_io_observer listener,
									   server_cfg cfg) throws
{
	for (;;)
	{
		session(sched,
				fi::u8iobuf_socket_file{co_await fop::async_accept(
					sched, {}, listener, fi::open_mode::no_block)},
				cfg)
			.detach();
	}
}

int main(int argc, char const **argv)
{
	using namespace fi::io;
	if (argc == 0)
	{
		return 1;
	}
	server_cfg cfg;
	::std::uint_least16_t port{8080};
	fi::u8cstring_view rootarg;
	fi::u8string rootpath;
	fi::u8string_view cors_extra;
	for (int i{1}; i != argc; ++i)
	{
		fi::u8cstring_view const arg{
			fi::mnp::os_c_str(reinterpret_cast<char8_t const *>(argv[i]))};
		if (arg == fi::u8cstring_view{u8"--help"} ||
			arg == fi::u8cstring_view{u8"-h"})
		{
			perr("Usage: ", ::fast_io::mnp::os_c_str(*argv),
				 " [root] [-p port] [-c seconds] [--server] [--cors[=headers]] "
				 "[--bypass] "
				 "[--lna loopback|local|public|address|hostname] [--no-index] "
				 "[--no-dir]\n");
			return 0;
		}
		if (arg == fi::u8cstring_view{u8"-p"} ||
			arg == fi::u8cstring_view{u8"--port"})
		{
			if (++i == argc)
			{
				break;
			}
			port = static_cast<::std::uint_least16_t>(
				fi::u8to<unsigned>(fi::u8cstring_view{
					fi::mnp::os_c_str(reinterpret_cast<char8_t const *>(argv[i]))}));
		}
		else if (arg == fi::u8cstring_view{u8"-c"} ||
				 arg == fi::u8cstring_view{u8"--cache"})
		{
			if (++i == argc)
			{
				break;
			}
			cfg.cache_seconds = fi::u8to<::std::size_t>(fi::u8cstring_view{
				fi::mnp::os_c_str(reinterpret_cast<char8_t const *>(argv[i]))});
		}
		else if (arg == fi::u8cstring_view{u8"--cors"})
		{
			cfg.cors = true;
		}
		else if (arg.size() > 7 && fi::u8string_view{arg.data(), 7} ==
									   fi::u8string_view{u8"--cors="})
		{
			/* node: --cors=hdr1,hdr2 appends to Access-Control-Allow-Headers */
			cfg.cors = true;
			cors_extra = fi::u8string_view{arg.data() + 7, arg.size() - 7};
		}
		else if (arg == fi::u8cstring_view{u8"--lna"} && i + 1 != argc)
		{
			++i;
			fi::u8cstring_view const val{
				fi::mnp::os_c_str(reinterpret_cast<char8_t const *>(argv[i]))};
			auto const rule{fi::lna_parse(val.data(), val.data() + val.size())};
			if (rule.kind == fi::lna_rule_kind::space)
			{
				cfg.lna_max = rule.space;
			}
			else if (rule.kind == fi::lna_rule_kind::literal)
			{
				cfg.allowed_peers.push_back(rule.address);
			}
			else
			{
				/* hostname — includes mDNS ".local" names, resolved
				 * through the system resolver like any other name */
				fi::native_dns_file dns{fi::mnp::os_c_str(argv[i])};
				for (auto const ent : dns)
				{
					cfg.allowed_peers.push_back(fi::to_ip_address(ent));
				}
			}
		}
		else if (arg == fi::u8cstring_view{u8"--bypass"})
		{
			/* /http(s)://... targets get proxied upstream with CORS
			 * headers — the cors-bypass/server.js feature */
			cfg.bypass = true;
		}
		else if (arg == fi::u8cstring_view{u8"--server"})
		{
			/* static file serving — off by default; the bypass proxy is
			 * this binary's primary role */
			cfg.http = true;
		}
		else if (arg == fi::u8cstring_view{u8"--no-index"})
		{
			cfg.autoindex = false;
		}
		else if (arg == fi::u8cstring_view{u8"--no-dir"})
		{
			cfg.showdir = false;
		}
		else if (rootarg.is_empty())
		{
			rootarg = arg;
		}
	}
	try
	{
		/* the root is held as an open dir handle for the process's
		 * lifetime — every request resolves relative to it */
		fi::u8native_file rootdir;
		if (cfg.http)
		{
			if (rootarg.is_empty())
			{
				/* node defaults to ./public when it exists, else . */
				try
				{
					fi::u8native_file pub{u8"./public",
										  fi::open_mode::in | fi::open_mode::directory};
					rootpath = u8"./public";
				}
				catch throws(::std::error)
				{
					rootpath = u8".";
				}
			}
			else
			{
				rootpath.assign(rootarg);
			}
			rootdir = fi::u8native_file{fi::mnp::os_c_str(rootpath.c_str()),
										fi::open_mode::in | fi::open_mode::directory};
			cfg.root = fi::at(rootdir);
		}

		fi::net_service service;
		fi::io_async_scheduler scheduler{fi::io_async};

		/* the bind happens once, outside the supervisor — a listen()
		 * failure (EADDRINUSE etc.) is fatal, not retryable: rebuilding
		 * the listener in a loop would spin on a permanent error */
		fi::u8native_socket_file listener{
			fi::tcp_listen(port, fi::open_mode::no_block)};

		if (cfg.cors)
		{
			/* node's header set: Allow-Origin "*" plus the shared
			 * Allow-Headers list, with --cors=extra appended */
			cfg.cors_block = fi::u8concat_fast_io(
				u8"\r\nAccess-Control-Allow-Origin: *"
				u8"\r\nAccess-Control-Allow-Headers: Authorization, Content-Type, "
				"If-Match, If-Modified-Since, If-None-Match, If-Unmodified-Since",
				cors_extra.empty() ? fi::u8string{}
								   : fi::u8concat_fast_io(u8", ", cors_extra));
		}

		/* build the whole banner in one string — each perr is a write()
		 * syscall, and a dozen of them for one banner is pure waste.
		 * status goes to stderr: stdout is block-buffered when piped */
		fi::u8string banner;
		fi::u8ostring_ref_fast_io w{__builtin_addressof(banner)};
		fi::io::print(w, u8"Starting up pwa-player-server");
		if (cfg.http)
		{
			fi::io::print(w, u8", serving ",
						  fi::u8string_view{rootpath.data(), rootpath.size()});
		}
		fi::io::print(w,
					  u8"\n\nhttp-server settings:\n"
					  u8"File server (--server): ",
					  cfg.http ? fi::u8cstring_view{u8"enabled"}
							   : fi::u8cstring_view{u8"disabled"},
					  u8"\nCORS (--cors[=headers]): ",
					  cfg.cors ? fi::u8cstring_view{u8"enabled"}
							   : fi::u8cstring_view{u8"disabled"},
					  u8"\nCache (-c): ", cfg.cache_seconds,
					  u8" seconds\n"
					  u8"Directory Listings (--no-dir): ",
					  cfg.showdir ? fi::u8cstring_view{u8"visible"}
								  : fi::u8cstring_view{u8"not visible"},
					  u8"\nAutoIndex (--no-index): ",
					  cfg.autoindex ? fi::u8cstring_view{u8"visible"}
									: fi::u8cstring_view{u8"not visible"},
					  u8"\nCORS bypass (--bypass): ",
					  cfg.bypass ? fi::u8cstring_view{u8"enabled"}
								 : fi::u8cstring_view{u8"disabled"},
					  u8"\nAccess space (--lna): ",
					  !cfg.allowed_peers.is_empty()
						  ? fi::u8cstring_view{u8"allow-list"}
					  : cfg.lna_max == fi::ip_address_space::loopback_address
						  ? fi::u8cstring_view{u8"loopback"}
					  : cfg.lna_max == fi::ip_address_space::public_address
						  ? fi::u8cstring_view{u8"public"}
						  : fi::u8cstring_view{u8"local (LAN only)"},
					  u8"\n\nAvailable on:\n");
		if (!cfg.allowed_peers.is_empty())
		{
			fi::io::print(w, u8"Allowed peers:\n");
			for (auto const &p : cfg.allowed_peers)
			{
				fi::io::print(w, u8"  ", p, u8"\n");
			}
		}
		if (fi::native_ifaddrs_file ifas{fi::ifaddrs_enumerate}; ifas)
		{
			/* two passes: loopback first, like node's listing */
			for (int pass{}; pass != 2; ++pass)
			{
				for (auto const ent : ifas)
				{
					if (fi::family(ent) != fi::sock_family::inet &&
						fi::family(ent) != fi::sock_family::inet6)
					{
						continue;
					}
					auto const addr{fi::address(ent)};
					bool const loop{addr.isv4 && addr.address.v4.address[0] == 127};
					if (loop == (pass == 0))
					{
						/* ip prints [::v6]:port / v4:port — brackets and
						 * port are part of the type's own format */
						fi::io::print(w, u8"  http://", fi::ip{addr, port}, u8"\n");
					}
				}
			}
		}
		fi::io::print(w, u8"Hit CTRL-C to stop the server\n");
		/* one write — the whole banner lands in a single syscall */
		fi::io::print(fi::u8err(), banner);

		/* supervisor: if the accept coroutine dies to a mid-run error
		 * (EMFILE & co.), log and rebuild it on the same listener */
		for (;;)
		{
			try
			{
				auto acceptor{accept_loop(scheduler, listener, cfg)};
				acceptor.resume();
				while (!acceptor.done())
				{
					fi::io_async_wait(scheduler);
				}
				acceptor.rethrow_if_error();
			}
			catch throws(::std::error e)
			{
				perrln(e);
			}
		}
	}
	catch throws(::std::error e)
	{
		perrln(e);
		return 1;
	}
	return 0;
}
