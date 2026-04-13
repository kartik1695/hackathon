import logging

from django.core.management.base import BaseCommand
from django.db import connection

logger = logging.getLogger("hrms")


class Command(BaseCommand):
    help = "Create pgvector extension in the configured Postgres database."

    def handle(self, *args, **options):
        with connection.cursor() as cursor:
            cursor.execute("CREATE EXTENSION IF NOT EXISTS vector;")
        logger.info("pgvector extension ensured")
        self.stdout.write(self.style.SUCCESS("pgvector extension ensured"))

