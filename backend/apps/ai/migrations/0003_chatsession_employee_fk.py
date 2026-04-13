"""
Migration: replace ChatSession.employee_id (bare IntegerField) with a proper
ForeignKey to employees.Employee.

SET_NULL is used so historical sessions survive if an employee record is deleted.

Data migration note: existing rows will have employee_id = NULL after this migration
because the old integer values cannot be verified as valid Employee PKs at migration
time. Run a one-off data fix if you need to backfill.
"""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("ai", "0002_alter_chatmessage_options_alter_chatsummary_options_and_more"),
        ("employees", "0001_initial"),
    ]

    operations = [
        # 1. Drop the old bare integer column.
        migrations.RemoveField(
            model_name="chatsession",
            name="employee_id",
        ),
        # 2. Add the FK column (nullable so existing rows are valid immediately).
        migrations.AddField(
            model_name="chatsession",
            name="employee",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="chat_sessions",
                to="employees.employee",
            ),
        ),
        # 3. Add ordering meta (no DB change, just state).
        migrations.AlterModelOptions(
            name="chatsession",
            options={"ordering": ["-last_active_at"]},
        ),
    ]
