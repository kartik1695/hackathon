"""
Management command: anonymize_users

Replaces real names and emails in the User table with fictional ones.
Saves the originals to a JSON backup file so they can be restored later.

Usage:
  # Anonymize (saves backup to data/real_users_backup.json):
  python manage.py anonymize_users

  # Restore from backup:
  python manage.py anonymize_users --restore

  # Custom backup path:
  python manage.py anonymize_users --backup-file /path/to/backup.json
"""

import json
import os
import random

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

# ---------------------------------------------------------------------------
# Fictional name pool — mix of first + last names
# ---------------------------------------------------------------------------
FIRST_NAMES = [
    "Aditya", "Priya", "Rohan", "Neha", "Vikram", "Sunita", "Arjun", "Kavya",
    "Deepak", "Meera", "Sanjay", "Pooja", "Rahul", "Divya", "Nikhil", "Anjali",
    "Manish", "Shruti", "Varun", "Ritu", "Karan", "Simran", "Aman", "Nisha",
    "Tarun", "Pallavi", "Gaurav", "Sneha", "Vivek", "Rekha", "Suresh", "Geeta",
    "Harish", "Manju", "Pankaj", "Swati", "Rajesh", "Usha", "Dinesh", "Lata",
    "Ashok", "Shobha", "Naresh", "Vandana", "Ramesh", "Anita", "Prakash", "Beena",
    "Hemant", "Champa",
]

LAST_NAMES = [
    "Sharma", "Verma", "Patel", "Singh", "Gupta", "Mishra", "Joshi", "Nair",
    "Rao", "Iyer", "Pillai", "Reddy", "Menon", "Bhat", "Kulkarni", "Desai",
    "Shah", "Mehta", "Jain", "Agarwal", "Bansal", "Srivastava", "Pandey", "Tiwari",
    "Yadav", "Chauhan", "Rathore", "Malhotra", "Kapoor", "Khanna",
]

FAKE_DOMAIN = "demo.hrms.internal"


def _fake_name(index: int) -> str:
    first = FIRST_NAMES[index % len(FIRST_NAMES)]
    last = LAST_NAMES[(index // len(FIRST_NAMES)) % len(LAST_NAMES)]
    return f"{first} {last}"


def _fake_email(name: str, index: int) -> str:
    slug = name.lower().replace(" ", ".")
    return f"{slug}.{index:03d}@{FAKE_DOMAIN}"


class Command(BaseCommand):
    help = "Anonymize (or restore) real user names and emails for demo/hackathon use."

    def add_arguments(self, parser):
        parser.add_argument(
            "--restore",
            action="store_true",
            help="Restore original names/emails from the backup file",
        )
        parser.add_argument(
            "--backup-file",
            default="data/real_users_backup.json",
            help="Path to backup JSON file (default: data/real_users_backup.json)",
        )

    def handle(self, *args, **options):
        backup_path = options["backup_file"]

        if options["restore"]:
            self._restore(backup_path)
        else:
            self._anonymize(backup_path)

    # -----------------------------------------------------------------------

    def _anonymize(self, backup_path: str):
        from apps.employees.models import User

        # Ensure backup dir exists
        os.makedirs(os.path.dirname(backup_path) if os.path.dirname(backup_path) else ".", exist_ok=True)

        if os.path.exists(backup_path):
            self.stdout.write(self.style.WARNING(
                f"Backup file already exists at {backup_path}. "
                "Delete it manually first if you want a fresh anonymization."
            ))
            raise CommandError("Aborting to avoid overwriting existing backup.")

        users = list(User.objects.all().order_by("id"))
        self.stdout.write(f"Found {len(users)} users. Anonymizing…")

        backup = {}
        rng = random.Random(42)  # deterministic so repeated runs produce same mapping
        indices = list(range(len(users)))
        rng.shuffle(indices)  # shuffle so index ≠ sequential DB order

        with transaction.atomic():
            for pos, user in enumerate(users):
                fake_name = _fake_name(indices[pos])
                fake_email = _fake_email(fake_name, indices[pos])

                backup[str(user.pk)] = {
                    "name": user.name,
                    "email": user.email,
                }

                user.name = fake_name
                user.email = fake_email
                user.save(update_fields=["name", "email"])

        with open(backup_path, "w", encoding="utf-8") as f:
            json.dump(backup, f, indent=2, ensure_ascii=False)

        self.stdout.write(self.style.SUCCESS(
            f"Done. {len(users)} users anonymized. Backup saved to {backup_path}"
        ))

    def _restore(self, backup_path: str):
        from apps.employees.models import User

        if not os.path.exists(backup_path):
            raise CommandError(f"Backup file not found: {backup_path}")

        with open(backup_path, encoding="utf-8") as f:
            backup = json.load(f)

        self.stdout.write(f"Restoring {len(backup)} users from {backup_path}…")

        restored = 0
        missing = 0
        with transaction.atomic():
            for pk_str, data in backup.items():
                try:
                    user = User.objects.get(pk=int(pk_str))
                    user.name = data["name"]
                    user.email = data["email"]
                    user.save(update_fields=["name", "email"])
                    restored += 1
                except User.DoesNotExist:
                    self.stdout.write(self.style.WARNING(f"  User pk={pk_str} not found — skipped."))
                    missing += 1

        self.stdout.write(self.style.SUCCESS(
            f"Done. Restored {restored} users. Skipped {missing} missing."
        ))
