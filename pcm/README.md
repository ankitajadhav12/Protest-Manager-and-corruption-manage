# Protest & Corruption Manager (PCM)

**Tagline:** Report. Track. Participate. Create Change.

PCM is a civic engagement and public accountability platform combining:
1. Corruption Reporting & Management System (with anonymous protection and private evidence storage)
2. Civic Complaint Management System
3. Peaceful Protest & Public Event Management System
4. Real-Time Civic Activity Map (Leaflet.js + OpenStreetMap + Flask-SocketIO)
5. Analytics & Transparency Dashboard (Chart.js + Pandas & NumPy)
6. Administrative Moderation & Oversight Console

---

## Ethical & Privacy Safeguards
- A corruption report represents an **allegation** under verification, never proof of wrongdoing.
- Anonymous submissions never store reporter user IDs or IP addresses.
- Sensitive corruption hotspots are generalized to a `~1.1 km` coordinate grid (`0.01°` precision).
- Aggregated heatmaps enforce a minimum cluster count threshold (`>= 2`).
- Private evidence files are stored outside public static directories and restricted to authorized reviewers.
- No live GPS tracking of individual protesters or complainants.

---

## Windows CMD Setup Instructions (Python Flask + MySQL 8.0)

### 1. Navigate to the `pcm` Directory
```cmd
cd pcm
```

### 2. Create and Activate Python Virtual Environment
```cmd
python -m venv venv
venv\Scripts\activate
```

### 3. Install Dependencies
```cmd
pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Configure MySQL 8.0 Database
Open MySQL 8.0 Command Line Client (or run via Windows CMD if `mysql` is on `PATH`):
```cmd
mysql -u root -p
```
Create the database user and import the schema & seed data:
```sql
CREATE USER IF NOT EXISTS 'pcm_user'@'localhost' IDENTIFIED BY 'StrongPassword123!';
GRANT ALL PRIVILEGES ON pcm_db.* TO 'pcm_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```
Initialize the 14-table schema and seed data from Windows CMD:
```cmd
mysql -u root -p < database\schema.sql
mysql -u root -p < database\seed.sql
```

### 5. Configure Environment Variables
```cmd
copy .env.example .env
```
Edit `.env` in Notepad or VS Code and update `SECRET_KEY` and `MYSQL_PASSWORD`.

### 6. Run Tests
```cmd
pytest tests\test_pcm.py
```

### 7. Start the Flask + SocketIO Application
```cmd
python run.py
```
Open `http://127.0.0.1:5000` in your browser.
