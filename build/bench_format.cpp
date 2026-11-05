#include <cstddef>
#include <cstdint>
#include <fast_io.h>
#include <fast_io_dsal/string.h>
#include <fast_io_dsal/string_view.h>
#include <fast_io_unit/floating.h>

namespace
{
inline ::fast_io::u8string out_str;

// "M:SS" - the formatTime() shape used on every timeupdate.
inline ::std::size_t fmt_time(double seconds)
{
	using namespace ::fast_io::io;
	out_str.clear();
	::fast_io::u8ostring_ref_fast_io out{::std::addressof(out_str)};
	auto const total{static_cast<::std::uint_least64_t>(seconds >= 0 ? seconds : 0)};
	auto const m{total / 60u};
	auto const s{total % 60u};
	char8_t two[2]{static_cast<char8_t>(u8'0' + s / 10u), static_cast<char8_t>(u8'0' + s % 10u)};
	print(out, m, u8":", ::fast_io::u8string_view{two, 2});
	return out_str.size();
}

// x.toFixed(n)
inline ::std::size_t fmt_fixed(double value, ::std::size_t decimals)
{
	using namespace ::fast_io::io;
	out_str.clear();
	::fast_io::u8ostring_ref_fast_io out{::std::addressof(out_str)};
	print(out, ::fast_io::mnp::fixed(value, decimals));
	return out_str.size();
}

// Bulk: `count` sizes as "%.2f MB\n"
inline ::std::size_t fmt_bulk(::std::uint_least32_t count)
{
	using namespace ::fast_io::io;
	out_str.clear();
	::fast_io::u8ostring_ref_fast_io out{::std::addressof(out_str)};
	for (::std::uint_least32_t i{}; i != count; ++i)
	{
		double const bytes{static_cast<double>(i) * 1430.0 + 1024.0};
		print(out, ::fast_io::mnp::fixed(bytes / 1048576.0, 2), u8" MB\n");
	}
	return out_str.size();
}
} // namespace

extern "C"
{
	[[__gnu__::__visibility__("default")]] char8_t const *fb_out() noexcept { return out_str.data(); }
	[[__gnu__::__visibility__("default")]] ::std::size_t fb_time(double s) noexcept { return fmt_time(s); }
	[[__gnu__::__visibility__("default")]] ::std::size_t fb_fixed(double v, ::std::size_t d) noexcept { return fmt_fixed(v, d); }
	[[__gnu__::__visibility__("default")]] ::std::size_t fb_bulk(::std::uint_least32_t n) noexcept { return fmt_bulk(n); }
}
