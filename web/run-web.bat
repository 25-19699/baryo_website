@echo off
cd /d "%~dp0"
if not defined BARYOKONEK_DB_URL set BARYOKONEK_DB_URL=jdbc:postgresql://localhost:5432/baryokonek
if not defined BARYOKONEK_DB_USER set BARYOKONEK_DB_USER=baryokonek_app
if not defined BARYOKONEK_DB_PASSWORD set BARYOKONEK_DB_PASSWORD=ChangeThisPassword123!
if not defined BARYOKONEK_WEB_PORT set BARYOKONEK_WEB_PORT=8080
if not defined BARYOKONEK_WEB_BIND set BARYOKONEK_WEB_BIND=0.0.0.0
if not defined BARYOKONEK_COOKIE_SECURE set BARYOKONEK_COOKIE_SECURE=false

echo Checking Java 25...
java -version 2>&1 | findstr /c:"25" >nul
if errorlevel 1 (
  echo JDK 25 is required. Install JDK 25 and configure JAVA_HOME/PATH.
  pause
  exit /b 1
)
where mvn >nul 2>nul
if errorlevel 1 (
  echo Apache Maven 3.9 or newer is required and must be on PATH.
  pause
  exit /b 1
)

echo Building BaryoKonek Web...
mvn clean package
if errorlevel 1 (
  echo Build failed. Review the Maven error above.
  pause
  exit /b 1
)

echo Starting BaryoKonek Web at http://localhost:8080
java --add-modules jdk.httpserver -jar target\BaryoKonekWebServer.jar
pause
