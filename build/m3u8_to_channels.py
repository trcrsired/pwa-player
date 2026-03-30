#!/usr/bin/env python3
"""
M3U8 to iptvchannels.js converter

Parses M3U8 playlist files and generates JavaScript array format
for use in pwa-player's iptvchannels.js.

Usage:
    python m3u8_to_channels.py input.m3u8 output.js
    python m3u8_to_channels.py input.m3u8 --stdout
    python m3u8_to_channels.py input.m3u8 --group-by-name
    python m3u8_to_channels.py input.m3u8 --unique-url
"""

import re
import sys
import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.parse import urlparse


def parse_extinf(line: str) -> Optional[Tuple[str, Dict]]:
    """
    Parse #EXTINF line to extract channel name and metadata.

    Format: #EXTINF:-1 tvg-name="..." tvg-logo="..." group-title="..." ...,ChannelName

    Returns: (channel_name, metadata_dict) or None if invalid
    """
    if not line.startswith('#EXTINF:'):
        return None

    # Remove #EXTINF:-1 prefix
    content = line[8:].strip()

    # Split by comma to get attributes and name
    comma_pos = content.rfind(',')
    if comma_pos == -1:
        return None

    attrs_part = content[:comma_pos]
    name = content[comma_pos + 1:].strip()

    metadata = {}

    # Parse tvg-name
    tvg_name_match = re.search(r'tvg-name="([^"]*)"', attrs_part)
    if tvg_name_match:
        metadata['tvg_name'] = tvg_name_match.group(1)

    # Parse tvg-logo
    tvg_logo_match = re.search(r'tvg-logo="([^"]*)"', attrs_part)
    if tvg_logo_match:
        metadata['tvg_logo'] = tvg_logo_match.group(1)

    # Parse group-title
    group_match = re.search(r'group-title="([^"]*)"', attrs_part)
    if group_match:
        metadata['group'] = group_match.group(1)

    return name, metadata


def normalize_channel_name(name: str) -> str:
    """
    Normalize channel name for grouping.
    Removes common variations like hyphens, spaces, suffixes.
    """
    # Remove common suffixes like "-HD", "HD", "-4K", "4K"
    normalized = re.sub(r'[-\s]?[Hh][Dd]$', '', name)
    normalized = re.sub(r'[-\s]?4[Kk]$', '', normalized)

    # Normalize hyphens and spaces
    normalized = normalized.replace('-', '').replace(' ', '')

    # Upper case for consistency
    normalized = normalized.upper()

    return normalized


def is_ip_url(url: str) -> bool:
    """Check if URL uses IP address instead of domain."""
    parsed = urlparse(url)
    hostname = parsed.hostname or ''

    # Check for IP address pattern
    ip_pattern = r'^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$'
    return bool(re.match(ip_pattern, hostname))


def parse_m3u8(content: str, group_by_name: bool = True, unique_urls: bool = False,
               include_logo: bool = False, include_group: bool = False) -> List[Dict]:
    """
    Parse M3U8 content and return list of channel objects.

    Args:
        content: M3U8 file content
        group_by_name: Group multiple URLs for same channel by normalized name
        unique_urls: Remove duplicate URLs within each channel
        include_logo: Include logo field in output
        include_group: Include group field in output

    Returns:
        List of channel objects ready for iptvchannels.js
    """
    lines = content.strip().split('\n')

    # Dictionary to group channels by normalized name
    channel_groups: Dict[str, Dict] = {}

    # For non-grouped mode
    channels: List[Dict] = []

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        if line.startswith('#EXTINF:'):
            parsed = parse_extinf(line)
            if parsed:
                name, metadata = parsed

                # Look for URL on next line
                i += 1
                if i < len(lines):
                    url = lines[i].strip()
                    if url and not url.startswith('#'):
                        if group_by_name:
                            norm_name = normalize_channel_name(name)
                            if norm_name not in channel_groups:
                                channel_groups[norm_name] = {
                                    'original_names': [name],
                                    'urls': [],
                                    'metadata': metadata
                                }
                            else:
                                # Track original names for choosing the best one
                                if name not in channel_groups[norm_name]['original_names']:
                                    channel_groups[norm_name]['original_names'].append(name)

                            if unique_urls:
                                if url not in channel_groups[norm_name]['urls']:
                                    channel_groups[norm_name]['urls'].append(url)
                            else:
                                channel_groups[norm_name]['urls'].append(url)
                        else:
                            channel = {'name': name, 'url': url}
                            channels.append(channel)
        i += 1

    if group_by_name:
        # Convert groups to channel objects
        result = []
        for norm_name, group in sorted(channel_groups.items()):
            urls = group['urls']

            # Choose best original name (prefer one with hyphens/formatting)
            original_names = group['original_names']
            best_name = original_names[0]
            for n in original_names:
                # Prefer names with proper formatting (hyphens)
                if '-' in n and 'CCTV' in n:
                    best_name = n
                    break

            if len(urls) == 1:
                channel = {'name': best_name, 'url': urls[0]}
            else:
                channel = {'name': best_name, 'urls': urls}

            # Add metadata if available
            meta = group['metadata']
            if include_logo and meta.get('tvg_logo'):
                channel['logo'] = meta['tvg_logo']
            if include_group and meta.get('group'):
                channel['group'] = meta['group']

            result.append(channel)
        return result

    return channels


def generate_js_output(channels: List[Dict], indent: int = 2) -> str:
    """
    Generate JavaScript output for iptvchannels.js format.
    """
    lines = ['// Generated from M3U8 file', 'export const iptvChannels = [']

    for channel in channels:
        json_str = json.dumps(channel, ensure_ascii=False, indent=indent)
        # Indent the entire JSON object
        indented = '\n'.join('  ' + line for line in json_str.split('\n'))
        lines.append(indented + ',')

    lines.append('];')
    return '\n'.join(lines)


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description='Convert M3U8 playlist to iptvchannels.js format'
    )
    parser.add_argument('input', help='Input M3U8 file path')
    parser.add_argument('output', nargs='?', help='Output JS file path (optional)')
    parser.add_argument('--stdout', action='store_true',
                        help='Print output to stdout instead of file')
    parser.add_argument('--group-by-name', action='store_true', default=True,
                        help='Group URLs by normalized channel name (default)')
    parser.add_argument('--no-group', action='store_false', dest='group_by_name',
                        help='Don\'t group URLs, output each EXTINF as separate entry')
    parser.add_argument('--unique-url', action='store_true',
                        help='Remove duplicate URLs within each channel group')
    parser.add_argument('--logo', action='store_true',
                        help='Include logo field in output')
    parser.add_argument('--group-field', action='store_true',
                        help='Include group field in output')
    parser.add_argument('--limit', type=int, help='Limit number of channels output')
    parser.add_argument('--filter-group', type=str,
                        help='Only include channels from specified group-title')

    args = parser.parse_args()

    # Read input file
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: Input file '{args.input}' not found", file=sys.stderr)
        sys.exit(1)

    content = input_path.read_text(encoding='utf-8')

    # Parse M3U8
    channels = parse_m3u8(content, group_by_name=args.group_by_name, unique_urls=args.unique_url,
                          include_logo=args.logo, include_group=args.group_field)

    # Filter by group if specified
    if args.filter_group:
        channels = [c for c in channels if c.get('group') == args.filter_group]

    # Limit if specified
    if args.limit:
        channels = channels[:args.limit]

    # Generate output
    output = generate_js_output(channels)

    # Write or print output
    if args.stdout or not args.output:
        # Print to stdout with UTF-8 encoding
        sys.stdout.buffer.write(output.encode('utf-8'))
        sys.stdout.buffer.flush()
    elif args.output:
        output_path = Path(args.output)
        output_path.write_text(output, encoding='utf-8')
        print(f"Written {len(channels)} channels to {args.output}")


if __name__ == '__main__':
    main()