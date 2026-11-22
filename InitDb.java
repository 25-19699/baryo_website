import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.*;
import java.util.Base64;

public class InitDb {
    static String env(String k, String d) { String v = System.getenv(k); return v == null || v.isBlank() ? d : v; }

    static String hash(String salt, String password) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] d = (salt + password).getBytes(StandardCharsets.UTF_8);
        for (int i = 0; i < 20000; i++) d = md.digest(d);
        return Base64.getEncoder().encodeToString(d);
    }

    public static void main(String[] args) {
        try (Connection c = DriverManager.getConnection(
                env("BARYOKONEK_DB_URL", ""), env("BARYOKONEK_DB_USER", ""), env("BARYOKONEK_DB_PASSWORD", ""));
             Statement s = c.createStatement()) {
            s.execute("CREATE TABLE IF NOT EXISTS app_users (username VARCHAR(20) PRIMARY KEY, role VARCHAR(10) NOT NULL CHECK (role IN ('ADMIN','RESIDENT')), password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, full_name TEXT NOT NULL, purok TEXT, contact VARCHAR(20), address TEXT)");
            s.execute("CREATE TABLE IF NOT EXISTS list_items (id BIGSERIAL PRIMARY KEY, category VARCHAR(40) NOT NULL, row_data TEXT[] NOT NULL)");
            s.execute("CREATE INDEX IF NOT EXISTS idx_list_items_category ON list_items(category, id)");
            s.execute("CREATE TABLE IF NOT EXISTS document_requests (request_id VARCHAR(30) PRIMARY KEY, document_type TEXT NOT NULL, resident_name TEXT NOT NULL, purpose TEXT, request_date TEXT, status TEXT NOT NULL, completed_at TIMESTAMP, quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1))");
            System.out.println("InitDb: tables ready.");

            String user = env("ADMIN_USERNAME", "admin");
            String pass = env("ADMIN_PASSWORD", "");
            if (pass.length() < 6) {
                System.out.println("InitDb: ADMIN_PASSWORD not set (min 6 chars), admin account skipped.");
                return;
            }
            byte[] sb = new byte[16];
            new SecureRandom().nextBytes(sb);
            String salt = Base64.getEncoder().encodeToString(sb);
            try (PreparedStatement p = c.prepareStatement(
                    "INSERT INTO app_users(role,username,password_salt,password_hash,full_name,purok,contact,address) VALUES('ADMIN',?,?,?,'Barangay Administrator','','','') ON CONFLICT (username) DO NOTHING")) {
                p.setString(1, user);
                p.setString(2, salt);
                p.setString(3, hash(salt, pass));
                int n = p.executeUpdate();
                System.out.println(n == 1 ? "InitDb: admin account '" + user + "' created." : "InitDb: admin '" + user + "' already exists, left unchanged.");
            }
        } catch (Exception e) {
            System.out.println("InitDb: failed - " + e);
        }
    }
}
