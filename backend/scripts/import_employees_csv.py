import csv
import os
import sys
import django
from datetime import datetime

# Add the project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
django.setup()

from apps.employees.models import Employee, User, Department

CSV_PATH = 'config/employees_employee.csv'

def run():
    if not os.path.exists(CSV_PATH):
        print(f"Error: {CSV_PATH} not found.")
        return

    # Phase 1: Essential data only (no managers)
    with open(CSV_PATH, 'r') as f:
        reader = csv.DictReader(f)
        count = 0
        skipped = 0
        rows = list(reader)
        
        print("Pass 1: Creating employees without manager links...")
        for row in rows:
            try:
                def clean_val(val):
                    if not val or val.lower() == 'null':
                        return None
                    return val

                user_id = clean_val(row.get('user_id'))
                if not user_id:
                    skipped += 1
                    continue

                try:
                    user = User.objects.get(id=user_id)
                except User.DoesNotExist:
                    skipped += 1
                    continue

                defaults = {
                    'employee_id': row.get('employee_id'),
                    'role': row.get('role', 'employee'),
                    'title': row.get('title', ''),
                    'is_active': row.get('is_active', 'True').lower() == 'true',
                    'user': user,
                }

                dept_id = clean_val(row.get('department_id'))
                if dept_id:
                    # In case dept doesn't exist, we might want to skip or handle it
                    defaults['department_id'] = int(dept_id)

                joined_on = clean_val(row.get('joined_on'))
                if joined_on:
                    try:
                        defaults['joined_on'] = datetime.strptime(joined_on.split()[0], '%Y-%m-%d').date()
                    except (ValueError, IndexError):
                        pass

                Employee.objects.update_or_create(
                    id=row['id'],
                    defaults=defaults
                )
                count += 1
            except Exception as e:
                skipped += 1

        print(f"Pass 1 finished. Created: {count}, Skipped: {skipped}")

        # Phase 2: Manager links
        print("Pass 2: Updating manager links...")
        link_count = 0
        for row in rows:
            mgr_id = row.get('manager_id')
            if mgr_id and mgr_id.lower() != 'null':
                try:
                    Employee.objects.filter(id=row['id']).update(manager_id=int(mgr_id))
                    link_count += 1
                except Exception:
                    pass
        print(f"Pass 2 finished. Manager links updated: {link_count}")

if __name__ == '__main__':
    run()

if __name__ == '__main__':
    run()
