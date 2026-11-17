import subprocess

diff = subprocess.check_output(
    ['git', 'diff', '81c19366', 'ece2736c', '--', 'frontend/src/pages/resident/ResidentHome.jsx'],
    text=True, encoding='utf-8'
)
lines = diff.splitlines()
for i, line in enumerate(lines):
    if any(term in line for term in ['hazard', 'reports', 'pointer', 'click', 'Marker', 'layer']) and line.startswith(('+', '-')):
        print(line[:120])
