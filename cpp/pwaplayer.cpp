/*
 * pwa-player WebAssembly core.
 *
 * Build:
 *   clang++ --config=$HOME/cfgs/wasm32-wasip1-noeh-nomtg.cfg -fherbceptions -lherbceptions \
 *           -flto=thin -s -O3 -nostartfiles -Wl,--no-entry ... -o pwaplayer.wasm pwaplayer.cpp
 *   (see cpp/build.sh / cpp/CMakeLists.txt)
 *
 * Responsibilities:
 *   1. Hold the ~671 entry IPTV channel catalogue as a flat `inline constexpr`
 *      table (cpp/iptv_channels_data.inc, generated from cpp/iptvchannels.js).
 *      Every name/URL is a sized ::fast_io::u8string_view, so nothing is ever
 *      NUL scanned and no JS object graph / GC pressure is created.
 *   2. Filter + paginate + render the channel list DOM markup with fast_io, so
 *      the browser only has to innerHTML one string per page.
 *   3. Shuffle a permutation with ::std::shuffle over fast_io's white-hole
 *      entropy engine, used by the JavaScript queue randomiser.
 *
 * UI translations deliberately stay in JavaScript: a per-string wasm call costs
 * ~350 ns (UTF-8 encode + TextDecoder) against ~11 ns for a JS Map lookup, no
 * matter how fast the C++ side is. See build/bench_locale.js.
 *
 * Exported entry points are declared at the bottom of this file.
 */
#include <cstddef>
#include <cstdint>
#include <algorithm>

#include <fast_io.h>
#include <fast_io_dsal/array.h>
#include <fast_io_dsal/string.h>
#include <fast_io_dsal/string_view.h>
#include <fast_io_dsal/vector.h>

namespace
{

// One channel. 24 bytes: a sized name view (pointer + length), then the URL
// range it owns inside iptv_data::urls, then flags and the optional zhcn name
// index. Keeping everything 16 bit makes the 671 entry table 16 KiB instead of
// 30 KiB of pointer/length pairs.
struct iptv_channel
{
	::fast_io::u8string_view name{};
	::std::uint_least16_t url_first{};
	::std::uint_least16_t url_count{};
	::std::uint_least16_t flags{};
	::std::uint_least16_t zhcn{};
};

// Language ids used by the renderer; anything unknown falls back to English.
enum class ui_language : ::std::uint_least32_t
{
	en,
	zhcn,
	ja
};

// Shared input buffer: JS writes the search string, or a single URL for
// pwa_url_flags(), into it before calling in.
inline constexpr ::std::size_t input_capacity{4096};
// Hard ceiling for one shuffle request; the buffer itself only grows to the size
// that is actually asked for, so the module does not reserve 256 KiB up front.
inline constexpr ::std::size_t shuffle_capacity{1u << 20};

inline ::fast_io::u8string out_str;
inline ::fast_io::u8string html_str;
inline ::fast_io::array<char8_t, input_capacity> input_buffer{};
inline ::fast_io::vector<::std::uint_least32_t> shuffle_buffer;
inline ::std::size_t shuffle_length{};
// One engine for the lifetime of the module, not one per shuffle_permutation()
// call: the engine buffers what it pulls from the OS, so a per-call engine
// throws that entropy away on every call and re-seeds from the same source
// every time. Keeping it global keeps the stream continuous.
inline ::fast_io::ibuf_white_hole_engine shuffle_engine;

} // namespace

#include "iptv_channels_data.inc"

namespace
{

// Bits returned by pwa_url_flags(); mirrored in source/wasm.js.
inline constexpr ::std::uint_least32_t url_flag_ip_host{1};
inline constexpr ::std::uint_least32_t url_flag_plain_http{2};

// Case insensitive (ASCII) substring search over UTF-8 bytes. Multi-byte
// sequences are compared byte by byte, which is exact for non-ASCII input.
inline bool contains_ascii_ci(::fast_io::u8string_view hay, ::fast_io::u8string_view needle) noexcept
{
	if (needle.is_empty())
	{
		return true;
	}
	if (hay.size() < needle.size())
	{
		return false;
	}
	auto const n{needle.size()};
	for (::std::size_t i{}; i + n <= hay.size(); ++i)
	{
		::std::size_t j{};
		while (j != n && ::fast_io::char_category::to_c_lower(hay[i + j]) ==
					::fast_io::char_category::to_c_lower(needle[j]))
		{
			++j;
		}
		if (j == n)
		{
			return true;
		}
	}
	return false;
}

inline bool starts_with(::fast_io::u8string_view hay, ::fast_io::u8string_view prefix) noexcept
{
	if (hay.size() < prefix.size())
	{
		return false;
	}
	for (::std::size_t i{}; i != prefix.size(); ++i)
	{
		if (::fast_io::char_category::to_c_lower(hay[i]) != ::fast_io::char_category::to_c_lower(prefix[i]))
		{
			return false;
		}
	}
	return true;
}

inline ::fast_io::u8string_view display_name(iptv_channel const &ch, ui_language lang) noexcept
{
	if (lang == ui_language::zhcn && ch.zhcn != iptv_data::no_zhcn &&
	    static_cast<::std::size_t>(ch.zhcn) < iptv_data::zhcn_names.size())
	{
		return iptv_data::zhcn_names[ch.zhcn];
	}
	return ch.name;
}

inline ::fast_io::u8string_view channel_url(iptv_channel const &ch, ::std::size_t index) noexcept
{
	return iptv_data::urls[ch.url_first + index];
}

// Host part of a URL, i.e. what is between the "://" separator and the first /?#.
inline ::fast_io::u8string_view url_host(::fast_io::u8string_view url) noexcept
{
	::std::size_t separator{url.size()};
	for (::std::size_t i{}; i + 3u <= url.size(); ++i)
	{
		if (url[i] == u8':' && url[i + 1u] == u8'/' && url[i + 2u] == u8'/')
		{
			separator = i;
			break;
		}
	}
	if (separator == url.size())
	{
		return {};
	}
	::std::size_t begin{separator + 3u};
	::std::size_t end{begin};
	while (end != url.size() && url[end] != u8'/' && url[end] != u8'?' && url[end] != u8'#')
	{
		++end;
	}
	// Drop a userinfo component, if any ("user:pass@host").
	for (::std::size_t i{begin}; i != end; ++i)
	{
		if (url[i] == u8'@')
		{
			begin = i + 1u;
		}
	}
	return ::fast_io::u8string_view{url.data() + begin, end - begin};
}

inline bool is_ip_address_url(::fast_io::u8string_view url) noexcept
{
	auto host{url_host(url)};
	if (host.is_empty())
	{
		return false;
	}
	// Bracketed IPv6 literal, e.g. [fe80::1]:8080
	if (host.front() == u8'[')
	{
		::std::size_t i{1};
		for (; i != host.size() && host[i] != u8']'; ++i)
		{
			if (!::fast_io::char_category::is_c_xdigit(host[i]) && host[i] != u8':')
			{
				return false;
			}
		}
		return i != 1;
	}
	// Bare IPv6 (rare, but accepted by the JS implementation as well)
	bool has_colon{};
	bool all_hex{true};
	for (char8_t ch : host)
	{
		if (ch == u8':')
		{
			has_colon = true;
		}
		else if (!::fast_io::char_category::is_c_xdigit(ch))
		{
			all_hex = false;
			break;
		}
	}
	if (has_colon && all_hex)
	{
		return true;
	}
	// Dotted quad, ignoring a trailing ":port"
	::std::size_t end{host.size()};
	for (::std::size_t i{}; i != host.size(); ++i)
	{
		if (host[i] == u8':')
		{
			end = i;
			break;
		}
	}
	::std::size_t group{};
	::std::size_t digits{};
	for (::std::size_t i{}; i != end; ++i)
	{
		char8_t const ch{host[i]};
		if (ch == u8'.')
		{
			if (digits == 0 || digits > 3)
			{
				return false;
			}
			++group;
			digits = 0;
			continue;
		}
		if (!::fast_io::char_category::is_c_digit(ch))
		{
			return false;
		}
		++digits;
	}
	return group == 3 && digits != 0 && digits <= 3;
}

inline bool is_plain_http_url(::fast_io::u8string_view url) noexcept
{
	return starts_with(url, ::fast_io::u8string_view{u8"http://"});
}

// Escape a name/URL for safe inclusion in text nodes and attributes.
inline void print_escaped(::fast_io::u8ostring_ref_fast_io out, ::fast_io::u8string_view sv)
{
	using namespace ::fast_io::io;
	::std::size_t run_begin{};
	for (::std::size_t i{}; i != sv.size(); ++i)
	{
		char8_t const ch{sv[i]};
		::fast_io::u8string_view replacement{};
		switch (ch)
		{
		case u8'&': replacement = ::fast_io::u8string_view{u8"&amp;"}; break;
		case u8'<': replacement = ::fast_io::u8string_view{u8"&lt;"}; break;
		case u8'>': replacement = ::fast_io::u8string_view{u8"&gt;"}; break;
		case u8'"': replacement = ::fast_io::u8string_view{u8"&quot;"}; break;
		case u8'\'': replacement = ::fast_io::u8string_view{u8"&#39;"}; break;
		default: continue;
		}
		if (i != run_begin)
		{
			print(out, ::fast_io::u8string_view{sv.data() + run_begin, i - run_begin});
		}
		print(out, replacement);
		run_begin = i + 1u;
	}
	if (run_begin != sv.size())
	{
		print(out, ::fast_io::u8string_view{sv.data() + run_begin, sv.size() - run_begin});
	}
}

inline void print_url_badge(::fast_io::u8ostring_ref_fast_io out, ::fast_io::u8string_view url)
{
	using namespace ::fast_io::io;
	if (is_ip_address_url(url))
	{
		print(out, u8"<span class=\"iptv-badge iptv-ip-badge\" title=\"IP address - may need CORS bypass server\">IP</span>");
	}
	else if (is_plain_http_url(url))
	{
		print(out, u8"<span class=\"iptv-badge iptv-http-badge\" title=\"HTTP - may require CORS bypass\">HTTP</span>");
	}
}

inline void render_channel(::fast_io::u8ostring_ref_fast_io out, ::std::size_t index, iptv_channel const &ch,
			   bool nsfw_unlocked, ui_language lang)
{
	using namespace ::fast_io::io;
	auto const name{display_name(ch, lang)};
	auto const primary_url{channel_url(ch, 0)};

	print(out, u8"<li class=\"iptv-node\" data-ch=\"", index, u8"\"><div class=\"iptv-header\">");
	if (ch.url_count > 1)
	{
		print(out, u8"<button class=\"iptv-toggle\"><span class=\"iptv-toggle-text\" data-icon=\"chevronRight\"></span>"
			   u8"<span class=\"iptv-count-badge\">(",
		      ch.url_count, u8")</span></button>");
	}
	else
	{
		print(out, u8"<button class=\"iptv-toggle\" data-icon=\"chevronRight\"></button>");
	}
	print(out, u8"<span class=\"iptv-name\">");
	print_escaped(out, name);
	if ((ch.flags & iptv_data::flag_nsfw) && nsfw_unlocked)
	{
		print(out, u8"<span class=\"iptv-badge iptv-nsfw-badge\">NSFW</span>");
	}
	if (ch.flags & iptv_data::flag_cors)
	{
		print(out, u8"<span class=\"iptv-badge iptv-http-badge\" title=\"Always uses CORS bypass\">CORS</span>");
	}
	else
	{
		print_url_badge(out, primary_url);
	}
	print(out, u8"</span><button class=\"iptv-menu\" data-icon=\"ellipsisV\" title=\"Menu\"></button></div>"
		   u8"<ul class=\"iptv-sub hidden\">");
	for (::std::size_t i{}; i != ch.url_count; ++i)
	{
		auto const url{channel_url(ch, i)};
		print(out, u8"<li class=\"iptv-subitem\" data-ch=\"", index, u8"\" data-url=\"", i,
		      u8"\"><span class=\"iptv-url-text\">");
		print_escaped(out, url);
		print_url_badge(out, url);
		print(out, u8"</span><button class=\"iptv-sub-menu\" data-icon=\"ellipsisV\" title=\"Menu\"></button></li>");
	}
	print(out, u8"</ul></li>");
}

struct iptv_query
{
	::fast_io::u8string_view search{};
	bool nsfw_unlocked{};
	ui_language lang{};
};

inline bool channel_matches(iptv_channel const &ch, iptv_query const &q) noexcept
{
	if ((ch.flags & iptv_data::flag_nsfw) && !q.nsfw_unlocked)
	{
		return false;
	}
	if (q.search.is_empty())
	{
		return true;
	}
	if (contains_ascii_ci(ch.name, q.search))
	{
		return true;
	}
	if (ch.zhcn != iptv_data::no_zhcn &&
	    static_cast<::std::size_t>(ch.zhcn) < iptv_data::zhcn_names.size() &&
	    contains_ascii_ci(iptv_data::zhcn_names[ch.zhcn], q.search))
	{
		return true;
	}
	return false;
}

inline ::std::size_t filtered_channel_count(iptv_query const &q) noexcept
{
	::std::size_t count{};
	for (iptv_channel const &ch : iptv_data::channels)
	{
		if (channel_matches(ch, q))
		{
			++count;
		}
	}
	return count;
}

// Render the `count` channels starting at filtered ordinal `start`.
inline ::std::size_t render_channel_page(iptv_query const &q, ::std::size_t start, ::std::size_t count)
{
	using namespace ::fast_io::io;
	html_str.clear();
	if (count == 0)
	{
		return 0;
	}
	::fast_io::u8ostring_ref_fast_io out{::std::addressof(html_str)};
	::std::size_t ordinal{};
	::std::size_t rendered{};
	for (::std::size_t index{}; index != iptv_data::channels.size(); ++index)
	{
		iptv_channel const &ch{iptv_data::channels[index]};
		if (!channel_matches(ch, q))
		{
			continue;
		}
		if (ordinal >= start)
		{
			render_channel(out, index, ch, q.nsfw_unlocked, q.lang);
			if (++rendered == count)
			{
				break;
			}
		}
		++ordinal;
	}
	return rendered;
}

inline void write_out(::fast_io::u8string_view sv)
{
	out_str.clear();
	::fast_io::u8ostring_ref_fast_io out{::std::addressof(out_str)};
	::fast_io::io::print(out, sv);
}

} // namespace

extern "C"
{
	/* ---- IPTV catalogue ------------------------------------------------ */

	[[__gnu__::__visibility__("default")]] ::std::size_t iptv_channel_count() noexcept
	{
		return iptv_data::channels.size();
	}

	// Writes the display name of channel `index` (language aware) into the
	// shared output buffer and returns its length; 0 for an invalid index.
	[[__gnu__::__visibility__("default")]] ::std::size_t iptv_channel_name(::std::size_t index,
									      ::std::uint_least32_t lang) noexcept
	{
		if (index >= iptv_data::channels.size())
		{
			return 0;
		}
		write_out(display_name(iptv_data::channels[index], static_cast<ui_language>(lang)));
		return out_str.size();
	}

	[[__gnu__::__visibility__("default")]] ::std::size_t iptv_channel_url_count(::std::size_t index) noexcept
	{
		if (index >= iptv_data::channels.size())
		{
			return 0;
		}
		return iptv_data::channels[index].url_count;
	}

	[[__gnu__::__visibility__("default")]] ::std::size_t iptv_channel_url(::std::size_t index,
									     ::std::size_t url_index) noexcept
	{
		if (index >= iptv_data::channels.size())
		{
			return 0;
		}
		iptv_channel const &ch{iptv_data::channels[index]};
		if (url_index >= ch.url_count)
		{
			return 0;
		}
		write_out(channel_url(ch, url_index));
		return out_str.size();
	}

	[[__gnu__::__visibility__("default")]] ::std::uint_least32_t iptv_channel_flags(::std::size_t index) noexcept
	{
		if (index >= iptv_data::channels.size())
		{
			return 0;
		}
		return iptv_data::channels[index].flags;
	}

	/* ---- filtering + paging + DOM rendering ---------------------------- */

	[[__gnu__::__visibility__("default")]] char8_t *pwa_input_ptr() noexcept
	{
		return input_buffer.data();
	}

	[[__gnu__::__visibility__("default")]] ::std::size_t pwa_input_capacity() noexcept
	{
		return input_capacity;
	}

	// Classify a single URL so JS and C++ agree on the badges/behaviour for
	// built-in and custom channels. Bit 0: IP literal host, bit 1: plain HTTP.
	[[__gnu__::__visibility__("default")]] ::std::uint_least32_t pwa_url_flags(::std::uint8_t const *url,
										  ::std::size_t url_len) noexcept
	{
		::fast_io::u8string_view const sv{reinterpret_cast<char8_t const *>(url), url_len};
		::std::uint_least32_t flags{};
		if (is_ip_address_url(sv))
		{
			flags |= url_flag_ip_host;
		}
		if (is_plain_http_url(sv))
		{
			flags |= url_flag_plain_http;
		}
		return flags;
	}

	[[__gnu__::__visibility__("default")]] ::std::size_t iptv_filtered_count(::std::uint8_t const *search,
										::std::size_t search_len,
										::std::uint_least32_t nsfw_unlocked) noexcept
	{
		iptv_query const q{::fast_io::u8string_view{reinterpret_cast<char8_t const *>(search), search_len},
				   nsfw_unlocked != 0, ui_language::en};
		return filtered_channel_count(q);
	}

	// Renders filtered ordinals [start, start + count) as <li> markup into the
	// HTML buffer and returns how many channels were written.
	[[__gnu__::__visibility__("default")]] ::std::size_t iptv_render_page(::std::uint8_t const *search,
									     ::std::size_t search_len,
									     ::std::size_t start,
									     ::std::size_t count,
									     ::std::uint_least32_t nsfw_unlocked,
									     ::std::uint_least32_t lang) noexcept
	{
		iptv_query const q{::fast_io::u8string_view{reinterpret_cast<char8_t const *>(search), search_len},
				   nsfw_unlocked != 0, static_cast<ui_language>(lang)};
		return render_channel_page(q, start, count);
	}

	[[__gnu__::__visibility__("default")]] char8_t const *iptv_html_ptr() noexcept
	{
		return html_str.c_str();
	}

	[[__gnu__::__visibility__("default")]] ::std::size_t iptv_html_len() noexcept
	{
		return html_str.size();
	}

	[[__gnu__::__visibility__("default")]] char8_t const *iptv_out_ptr() noexcept
	{
		return out_str.c_str();
	}

	[[__gnu__::__visibility__("default")]] ::std::size_t iptv_out_len() noexcept
	{
		return out_str.size();
	}

	/* ---- shuffle ------------------------------------------------------- */

	// Fills 0..n-1 and shuffles it with ::std::shuffle, driven by fast_io's
	// white hole (getrandom) entropy engine. Returns the permutation length.
	[[__gnu__::__visibility__("default")]] ::std::size_t shuffle_permutation(::std::size_t n) noexcept
	{
		if (n > shuffle_capacity)
		{
			n = shuffle_capacity;
		}
		shuffle_length = n;
		if (n == 0)
		{
			return 0;
		}
		shuffle_buffer.resize(n);
		for (::std::size_t i{}; i != n; ++i)
		{
			shuffle_buffer[i] = static_cast<::std::uint_least32_t>(i);
		}
		::std::shuffle(shuffle_buffer.data(), shuffle_buffer.data() + n, shuffle_engine);
		return shuffle_length;
	}

	[[__gnu__::__visibility__("default")]] ::std::uint_least32_t *shuffle_permutation_ptr() noexcept
	{
		return shuffle_buffer.data();
	}

	[[__gnu__::__visibility__("default")]] ::std::size_t shuffle_permutation_len() noexcept
	{
		return shuffle_length;
	}

}
