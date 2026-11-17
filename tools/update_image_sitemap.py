#!/usr/bin/env python3
"""
Add all catalog images to sitemap.xml with proper titles and captions.
Reads the images/catalog directory and generates image entries.
"""
import os
import re
from pathlib import Path
from datetime import datetime

SITE_ROOT = Path(__file__).parent.parent
CATALOG_DIR = SITE_ROOT / "images" / "catalog"
SITEMAP_FILE = SITE_ROOT / "sitemap.xml"

def get_image_title(filename):
    """Generate a human-readable title from filename."""
    name = Path(filename).stem
    # Remove size suffixes like -2, -3, etc.
    name = re.sub(r'-\d+$', '', name)
    # Convert hyphens/underscores to spaces
    name = name.replace('-', ' ').replace('_', ' ')
    # Title case
    return name.title()

def get_image_caption(filepath, title):
    """Generate a descriptive caption based on file path and title."""
    rel_path = filepath.relative_to(CATALOG_DIR)
    parts = rel_path.parts
    
    if len(parts) >= 2:
        category = parts[0]
        return f"{title} — BrownHub {category} work sample"
    return f"{title} — BrownHub design and print sample"

def collect_all_images():
    """Collect all catalog images."""
    images = []
    for ext in ['*.jpg', '*.jpeg', '*.png', '*.webp', '*.gif']:
        images.extend(CATALOG_DIR.rglob(ext))
    return sorted(set(images))

def generate_image_entry(img_path):
    """Generate XML entry for one image."""
    rel_path = img_path.relative_to(SITE_ROOT)
    url = f"https://www.brownhub283.com/{rel_path}"
    title = get_image_title(rel_path.name)
    caption = get_image_caption(img_path, title)
    
    return f"""    <image:image>
      <image:loc>{url}</image:loc>
      <image:title>{title}</image:title>
      <image:caption>{caption}</image:caption>
    </image:image>"""

def update_sitemap():
    """Add all catalog images to the home page URL entry in sitemap.xml."""
    print("Collecting catalog images...")
    all_images = collect_all_images()
    print(f"Found {len(all_images)} catalog images")
    
    # Read current sitemap
    with open(SITEMAP_FILE, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract existing image URLs to avoid duplicates
    existing_urls = set(re.findall(r'<image:loc>([^<]+)</image:loc>', content))
    print(f"Found {len(existing_urls)} existing image entries in sitemap")
    
    # Generate entries for new images
    new_entries = []
    for img_path in all_images:
        rel_path = img_path.relative_to(SITE_ROOT)
        url = f"https://www.brownhub283.com/{rel_path}"
        if url not in existing_urls:
            new_entries.append(generate_image_entry(img_path))
    
    print(f"Adding {len(new_entries)} new image entries")
    
    if not new_entries:
        print("No new images to add")
        return
    
    # Find the home page URL entry and add images before its closing </url>
    # Pattern: <url>\n    <loc>https://www.brownhub283.com/</loc> ... </url>
    home_pattern = r'(<url>\s*<loc>https://www\.brownhub283\.com/</loc>)(.*?)(</url>)'
    
    def add_images_to_home(match):
        opening = match.group(1)
        middle = match.group(2)
        closing = match.group(3)
        
        # Check if there are already image entries
        if '<image:image>' in middle:
            # Add after existing images
            return opening + middle + '\n' + '\n'.join(new_entries) + '\n  ' + closing
        else:
            # Add after other elements like lastmod, changefreq, priority
            return opening + middle + '\n' + '\n'.join(new_entries) + '\n  ' + closing
    
    updated_content = re.sub(home_pattern, add_images_to_home, content, flags=re.DOTALL)
    
    # Write back
    with open(SITEMAP_FILE, 'w', encoding='utf-8') as f:
        f.write(updated_content)
    
    print(f"Updated {SITEMAP_FILE}")

if __name__ == '__main__':
    update_sitemap()
