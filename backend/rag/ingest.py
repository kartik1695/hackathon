import logging
from pathlib import Path

logger = logging.getLogger("hrms")

DEFAULT_DOCS_DIR = Path(__file__).resolve().parent / "documents"


def ingest_documents(docs_dir: Path | None = None, chunk_size: int = 900, overlap: int = 120) -> dict:
    docs_dir = docs_dir or DEFAULT_DOCS_DIR
    try:
        from apps.rag.models import RAGDocument
    except ImportError as exc:
        logger.exception("RAGDocument model import failed")
        return {"status": "error", "error": str(exc)}

    paths = sorted([p for p in docs_dir.glob("*.txt") if p.is_file()])
    if not paths:
        logger.info("No RAG documents found dir=%s", docs_dir)
        return {"status": "ok", "ingested": 0}

    try:
        from core.llm.embedding_factory import EmbeddingProviderFactory
    except ImportError as exc:
        logger.exception("EmbeddingProviderFactory import failed")
        provider = None
        provider_error = str(exc)
    else:
        provider = None
        provider_error = None
        try:
            provider = EmbeddingProviderFactory.get_provider()
        except Exception as exc:
            logger.exception("Embedding provider init failed")
            provider_error = str(exc)
    try:
        from rag.retrieval import _fallback_embed
    except Exception:
        _fallback_embed = None

    ingested = 0
    for path in paths:
        title = path.stem
        content = path.read_text(encoding="utf-8")
        chunks = _chunk_text(content, chunk_size=chunk_size, overlap=overlap)

        RAGDocument.objects.filter(title=title).delete()
        for idx, chunk in enumerate(chunks):
            embedding = []
            if provider:
                try:
                    embedding = provider.embed(chunk)
                except Exception:
                    logger.exception("Embedding failed title=%s chunk=%s", title, idx)
                    embedding = []
            if embedding and len(embedding) != 1536:
                logger.info("Embedding dim mismatch title=%s chunk=%s dim=%s", title, idx, len(embedding))
                embedding = []
            if not embedding:
                if _fallback_embed:
                    embedding = _fallback_embed(chunk)
                else:
                    embedding = [0.0] * 1536
            doc = RAGDocument(title=title, source=str(path.name), chunk_index=idx, content=chunk)
            if embedding:
                doc.embedding = embedding
            doc.save()
            ingested += 1

        logger.info("RAG ingested title=%s chunks=%s", title, len(chunks))

    if provider_error:
        logger.info("RAG ingest completed with provider_error=%s", provider_error)

    return {"status": "ok", "ingested": ingested, "docs": len(paths)}


def _chunk_text(text: str, chunk_size: int, overlap: int) -> list[str]:
    text = (text or "").strip()
    if not text:
        return []
    if overlap >= chunk_size:
        overlap = max(0, chunk_size // 4)

    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(len(text), start + chunk_size)
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end == len(text):
            break
        start = max(0, end - overlap)
    return chunks
