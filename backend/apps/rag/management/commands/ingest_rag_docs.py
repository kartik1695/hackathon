import logging

from django.core.management.base import BaseCommand

from rag.ingest import ingest_documents

logger = logging.getLogger("hrms")


class Command(BaseCommand):
    help = "Ingest RAG documents from backend/rag/documents into Postgres (pgvector)."

    def handle(self, *args, **options):
        result = ingest_documents()
        if result.get("status") != "ok":
            logger.info("RAG ingest failed result=%s", result)
            raise SystemExit(1)
        logger.info("RAG ingest complete result=%s", result)
        self.stdout.write(self.style.SUCCESS(f"Ingested chunks={result.get('ingested')} docs={result.get('docs')}"))

