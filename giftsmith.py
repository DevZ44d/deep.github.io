"""
Telegram Collectible Gift Scraper
----------------------------------
Fetches a Telegram NFT gift page, downloads its .tgs sticker, converts it
to .json (Lottie format), organizes the output into folders, and updates
a target HTML file (gift badge link, label text, and Lottie json path).
"""

from __future__ import annotations

import gzip
import json
import logging
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import requests

logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
logger = logging.getLogger("gift_scraper")


@dataclass
class GiftInfo:
    """Metadata extracted from a Telegram gift page."""

    link: str
    sticker_url: str
    clean_name: str
    title: Optional[str]
    slug: Optional[str]
    number: Optional[str]

    @property
    def label_text(self) -> str:
        return self.title if self.title else self.clean_name


class TelegramGiftFetcher:
    """Fetches and parses Telegram collectible gift pages."""

    STICKER_PATTERN = re.compile(
        r'type="application/x-tgsticker"\s+srcset="([^"]+)"'
    )
    TITLE_PATTERN = re.compile(r'<meta property="og:title" content="([^"]+)"')
    SLUG_PATTERN = re.compile(r"/nft/([^/?#]+)")
    NUMBER_PATTERN = re.compile(r"#(\d+)")
    TRAILING_NUMBER_PATTERN = re.compile(r"-(\d+)$")

    def __init__(self, timeout: int = 20):
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36"
                )
            }
        )

    def fetch(self, link: str) -> GiftInfo:
        """Download the gift page and extract sticker URL, name, and number."""
        response = self.session.get(link, timeout=self.timeout)
        response.raise_for_status()
        html = response.text

        sticker_match = self.STICKER_PATTERN.search(html)
        if not sticker_match:
            raise ValueError(f"No .tgs sticker found on page: {link}")
        sticker_url = sticker_match.group(1)

        title_match = self.TITLE_PATTERN.search(html)
        title = title_match.group(1) if title_match else None

        slug_match = self.SLUG_PATTERN.search(link)
        slug = slug_match.group(1) if slug_match else None

        clean_name = self._build_clean_name(title, slug)
        number = self._extract_number(title, slug)

        return GiftInfo(
            link=link,
            sticker_url=sticker_url,
            clean_name=clean_name,
            title=title,
            slug=slug,
            number=number,
        )

    def _build_clean_name(self, title: Optional[str], slug: Optional[str]) -> str:
        if title:
            name_part = re.sub(r"\s*#\d+$", "", title).strip()
            return name_part.replace(" ", "")
        if slug:
            return self.TRAILING_NUMBER_PATTERN.sub("", slug)
        return "gift"

    def _extract_number(self, title: Optional[str], slug: Optional[str]) -> Optional[str]:
        if title:
            match = self.NUMBER_PATTERN.search(title)
            if match:
                return match.group(1)
        if slug:
            match = self.TRAILING_NUMBER_PATTERN.search(slug)
            if match:
                return match.group(1)
        return None


class GiftAssetConverter:
    """Downloads .tgs stickers and converts them to Lottie .json."""

    def __init__(self, tgs_dir: str = "tgs", json_dir: str = "GiftsJson", timeout: int = 30):
        self.tgs_dir = Path(tgs_dir)
        self.json_dir = Path(json_dir)
        self.timeout = timeout
        self.session = requests.Session()

        self.tgs_dir.mkdir(parents=True, exist_ok=True)
        self.json_dir.mkdir(parents=True, exist_ok=True)

    def download_tgs(self, sticker_url: str, clean_name: str) -> Path:
        tgs_path = self.tgs_dir / f"{clean_name}.tgs"
        response = self.session.get(sticker_url, timeout=self.timeout)
        response.raise_for_status()
        tgs_path.write_bytes(response.content)
        return tgs_path

    def convert_to_json(self, tgs_path: Path, clean_name: str) -> Path:
        json_path = self.json_dir / f"{clean_name}.json"
        with gzip.open(tgs_path, "rb") as f:
            data = json.load(f)
        json_path.write_text(json.dumps(data), encoding="utf-8")
        return json_path

    def process(self, sticker_url: str, clean_name: str) -> tuple[Path, Path]:
        tgs_path = self.download_tgs(sticker_url, clean_name)
        json_path = self.convert_to_json(tgs_path, clean_name)
        return tgs_path, json_path


class GiftHtmlUpdater:
    """Updates a target HTML file's gift badge link, label, and json path."""

    HREF_PATTERN = re.compile(
        r'(<a href=")https://t\.me/nft/[^"]+'
        r'("\s+target="_blank"\s+rel="noopener"\s+class="gift-badge">)'
    )
    LABEL_PATTERN = re.compile(r'(<span class="gift-label-text">)[^<]+(</span>)')
    JSON_PATH_PATTERN = re.compile(r'(path:\s*")[^"]+\.json(")')

    def __init__(self, html_path: str):
        self.html_path = Path(html_path)

    def update(self, gift: GiftInfo, json_rel_path: str) -> None:
        if not self.html_path.exists():
            raise FileNotFoundError(f"HTML file not found: {self.html_path}")

        html = self.html_path.read_text(encoding="utf-8")

        html, href_count = self.HREF_PATTERN.subn(rf"\1{gift.link}\2", html)
        html, label_count = self.LABEL_PATTERN.subn(rf"\1{gift.label_text}\2", html)
        html, path_count = self.JSON_PATH_PATTERN.subn(
            rf'\g<1>{json_rel_path}\g<2>', html
        )

        if not (href_count and label_count and path_count):
            logger.warning(
                "Some placeholders were not found (href=%d, label=%d, path=%d). "
                "Review the HTML file manually.",
                href_count,
                label_count,
                path_count,
            )

        self.html_path.write_text(html, encoding="utf-8")


class GiftPipeline:
    """Orchestrates fetching, downloading, converting, and HTML updating."""

    def __init__(self, html_path: Optional[str] = None):
        self.fetcher = TelegramGiftFetcher()
        self.converter = GiftAssetConverter()
        self.html_updater = GiftHtmlUpdater(html_path) if html_path else None

    def run(self, link: str) -> GiftInfo:
        logger.info("Fetching gift page: %s", link)
        gift = self.fetcher.fetch(link)

        logger.info("Downloading and converting sticker for: %s", gift.clean_name)
        tgs_path, json_path = self.converter.process(gift.sticker_url, gift.clean_name)
        json_rel_path = json_path.as_posix()

        logger.info("Done: %s -> %s, %s", gift.clean_name, tgs_path, json_path)

        if self.html_updater:
            self.html_updater.update(gift, json_rel_path)
            logger.info("Updated HTML: %s", self.html_updater.html_path)

        return gift


def main() -> None:
    link = input("Enter Gift link: ").strip()
    pipeline = GiftPipeline(html_path="index.html")
    try:
        pipeline.run(link)
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed for %s: %s", link, exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
