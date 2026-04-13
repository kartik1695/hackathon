from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


@dataclass
class Chunk:
    index: int
    content: str
    metadata: dict


class BaseChunker:
    def chunk(self, text: str) -> list[Chunk]:
        raise NotImplementedError


class SimpleChunker(BaseChunker):
    def __init__(self, chunk_size: int = 900, overlap: int = 120):
        self.chunk_size = chunk_size
        self.overlap = overlap

    def chunk(self, text: str) -> list[Chunk]:
        text = (text or "").strip()
        if not text:
            return []
        chunks: list[Chunk] = []
        start = 0
        i = 0
        overlap = self.overlap if self.overlap < self.chunk_size else max(0, self.chunk_size // 4)
        while start < len(text):
            end = min(len(text), start + self.chunk_size)
            part = text[start:end].strip()
            if part:
                chunks.append(Chunk(index=i, content=part, metadata={"strategy": "simple"}))
                i += 1
            if end == len(text):
                break
            start = max(0, end - overlap)
        return chunks


class MetadataChunker(BaseChunker):
    def __init__(self, max_len: int = 1200):
        self.max_len = max_len

    def chunk(self, text: str) -> list[Chunk]:
        paras = [p.strip() for p in text.split("\n\n") if p.strip()]
        chunks: list[Chunk] = []
        buf: list[str] = []
        i = 0
        meta: dict = {"strategy": "metadata"}
        for p in paras:
            if p.lower().startswith(("title:", "section:", "policy:", "chapter:")):
                if buf:
                    chunks.append(Chunk(index=i, content="\n\n".join(buf), metadata=meta.copy()))
                    i += 1
                    buf = []
                key, _, val = p.partition(":")
                meta[key.strip().lower()] = val.strip()
                continue
            nxt = ("\n\n".join(buf + [p])).strip()
            if len(nxt) > self.max_len and buf:
                chunks.append(Chunk(index=i, content="\n\n".join(buf), metadata=meta.copy()))
                i += 1
                buf = [p]
            else:
                buf.append(p)
        if buf:
            chunks.append(Chunk(index=i, content="\n\n".join(buf), metadata=meta.copy()))
        return chunks


class SchemaChunker(BaseChunker):
    def __init__(self, max_len: int = 1500):
        self.max_len = max_len

    def chunk(self, text: str) -> list[Chunk]:
        lines = [l.rstrip() for l in text.splitlines()]
        chunks: list[Chunk] = []
        buf: list[str] = []
        i = 0
        header: str | None = None
        for line in lines:
            if line.startswith(("# ", "## ", "### ")):
                if buf:
                    chunks.append(Chunk(index=i, content="\n".join(buf).strip(), metadata={"strategy": "schema", "header": header or ""}))
                    i += 1
                    buf = []
                header = line.lstrip("#").strip()
                buf.append(line)
                continue
            nxt = ("\n".join(buf + [line])).strip()
            if len(nxt) > self.max_len and buf:
                chunks.append(Chunk(index=i, content="\n".join(buf).strip(), metadata={"strategy": "schema", "header": header or ""}))
                i += 1
                buf = [line]
            else:
                buf.append(line)
        if buf:
            chunks.append(Chunk(index=i, content="\n".join(buf).strip(), metadata={"strategy": "schema", "header": header or ""}))
        return chunks


def load_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")

