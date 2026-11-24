import com.google.gson.*;
import com.sun.net.httpserver.*;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.sql.*;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.*;

/**
 * BaryoKonek browser server. Uses the existing PostgreSQL schema and creates
 * one additive archived_residents table on demand when an admin first archives
 * a resident. It deliberately does NOT call the Swing Database.initialize(),
 * because that routine contains a one-time destructive content reset migration.
 */
public class BaryoKonekWebServer {
    private static final Gson GSON = new GsonBuilder().serializeNulls().create();
    private static final String DB_URL = env("BARYOKONEK_DB_URL", "jdbc:postgresql://localhost:5432/baryokonek");
    private static final String DB_USER = env("BARYOKONEK_DB_USER", "postgres");
    private static final String DB_PASSWORD = env("BARYOKONEK_DB_PASSWORD", "postgres");
    private static final int PORT = Integer.parseInt(env("PORT", env("BARYOKONEK_WEB_PORT", "8080")));
    private static final String BIND_HOST = env("BARYOKONEK_WEB_BIND", "0.0.0.0");
    private static final boolean SECURE_COOKIE = Boolean.parseBoolean(env("BARYOKONEK_COOKIE_SECURE", System.getenv().containsKey("PORT") ? "true" : "false"));
    private static final Map<String, Session> SESSIONS = new ConcurrentHashMap<>();
    private static final Map<String, Attempt> ATTEMPTS = new ConcurrentHashMap<>();
    private static final ExecutorService POOL = Executors.newFixedThreadPool(Math.max(12, Runtime.getRuntime().availableProcessors() * 2));
    private static volatile Boolean HAS_QUANTITY = null;
    private static volatile Boolean HAS_COMPLETED_AT = null;
    private static volatile boolean ARCHIVE_TABLE_READY = false;

    record User(String role, String username, String fullName, String purok, String contact, String address) {
        boolean admin() { return "ADMIN".equals(role); }
    }
    record Session(User user, long created) {}
    static class Attempt { int count; long lockedUntil; }
    record ListItem(long id, String category, List<String> values) {}

    public static void main(String[] args) throws Exception {
        // A connectivity check only. No CREATE, ALTER, DELETE, or migration SQL is run.
        try (Connection ignored = db()) {
            System.out.println("Connected to existing BaryoKonek PostgreSQL database.");
        }
        HttpServer server = HttpServer.create(new InetSocketAddress(BIND_HOST, PORT), 0);
        server.createContext("/", BaryoKonekWebServer::handle);
        server.setExecutor(POOL);
        server.start();
        System.out.println("BaryoKonek Web is listening on http://" + BIND_HOST + ":" + PORT);
        System.out.println("For public internet access, deploy behind HTTPS on a secured cloud server/reverse proxy.");
    }

    private static String env(String key, String fallback) { String v = System.getenv(key); return v == null || v.isBlank() ? fallback : v; }
    private static Connection db() throws SQLException { return DriverManager.getConnection(DB_URL, DB_USER, DB_PASSWORD); }
    private static boolean hasColumn(String table, String column) throws SQLException {
        try (Connection c = db(); PreparedStatement p = c.prepareStatement("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=? AND column_name=?)")) {
            p.setString(1, table); p.setString(2, column); try (ResultSet r = p.executeQuery()) { r.next(); return r.getBoolean(1); }
        }
    }
    private static boolean hasQuantity() throws SQLException { if (HAS_QUANTITY == null) HAS_QUANTITY = hasColumn("document_requests", "quantity"); return HAS_QUANTITY; }
    private static boolean hasCompletedAt() throws SQLException { if (HAS_COMPLETED_AT == null) HAS_COMPLETED_AT = hasColumn("document_requests", "completed_at"); return HAS_COMPLETED_AT; }

    private static void handle(HttpExchange x) throws IOException {
        try {
            String path = x.getRequestURI().getPath();
            if (path.startsWith("/api/")) api(x, path);
            else staticFile(x, path);
        } catch (ApiException e) {
            json(x, e.status, obj("error", e.getMessage()));
        } catch (Exception e) {
            e.printStackTrace();
            json(x, 500, obj("error", "The server could not complete this request. Check the server console for details."));
        } finally { x.close(); }
    }

    private static void staticFile(HttpExchange x, String path) throws IOException {
        String file = switch (path) {
            case "/", "/index.html" -> "index.html";
            case "/app.css" -> "app.css";
            case "/app.js" -> "app.js";
            case "/barangay.jpg" -> "barangay.jpg";
            case "/manifest.webmanifest" -> "manifest.webmanifest";
            case "/sw.js" -> "sw.js";
            case "/icon-192.png" -> "icon-192.png";
            case "/icon-512.png" -> "icon-512.png";
            default -> null;
        };
        if (file == null) { bytes(x, 404, "text/plain; charset=utf-8", "Not found".getBytes(StandardCharsets.UTF_8)); return; }
        String base = "/static/" + file;
        try (InputStream in = BaryoKonekWebServer.class.getResourceAsStream(base)) {
            if (in == null) { bytes(x, 404, "text/plain; charset=utf-8", "Missing web asset: " + file); return; }
            byte[] body = in.readAllBytes();
            String type = file.endsWith(".css") ? "text/css; charset=utf-8" : file.endsWith(".js") ? "text/javascript; charset=utf-8" : file.endsWith(".jpg") ? "image/jpeg" : file.endsWith(".png") ? "image/png" : file.endsWith(".webmanifest") ? "application/manifest+json; charset=utf-8" : "text/html; charset=utf-8";
            bytes(x, 200, type, body);
        }
    }

    private static void api(HttpExchange x, String path) throws Exception {
        String method = x.getRequestMethod().toUpperCase(Locale.ROOT);
        enforceSameOrigin(x, method);
        JsonObject body = readJson(x);
        if (path.equals("/api/login") && method.equals("POST")) { login(x, body); return; }
        if (path.equals("/api/register") && method.equals("POST")) { register(x, body); return; }
        if (path.equals("/api/logout") && method.equals("POST")) { logout(x); return; }
        User user = requireUser(x);
        if (path.equals("/api/me") && method.equals("GET")) { json(x, 200, userJson(user)); return; }
        if (path.equals("/api/dashboard") && method.equals("GET")) { dashboard(x, user); return; }
        if (path.equals("/api/residents") && method.equals("GET")) { requireAdmin(user); residents(x); return; }
        if (path.equals("/api/residents") && method.equals("POST")) { requireAdmin(user); createResident(x, body); return; }
        if (path.startsWith("/api/residents/") && path.endsWith("/archive") && method.equals("POST")) {
            requireAdmin(user);
            String username = path.substring("/api/residents/".length(), path.length() - "/archive".length());
            archiveResident(x, decode(username), user.username());
            return;
        }
        if (path.equals("/api/documents") && method.equals("GET")) { documents(x); return; }
        if (path.equals("/api/documents") && method.equals("POST")) { requireAdmin(user); createDocument(x, body); return; }
        if (path.startsWith("/api/documents/") && method.equals("PUT")) { requireAdmin(user); updateDocument(x, parseId(path), body); return; }
        if (path.startsWith("/api/documents/") && method.equals("DELETE")) { requireAdmin(user); deleteListItem(x, "documents", parseId(path)); return; }
        if (path.equals("/api/announcements") && method.equals("GET")) { announcements(x); return; }
        if (path.equals("/api/announcements") && method.equals("POST")) { requireAdmin(user); createAnnouncement(x, body); return; }
        if (path.startsWith("/api/announcements/") && method.equals("PUT")) { requireAdmin(user); updateAnnouncement(x, parseId(path), body); return; }
        if (path.startsWith("/api/announcements/") && method.equals("DELETE")) { requireAdmin(user); deleteAnnouncement(x, parseId(path)); return; }
        if (path.equals("/api/requests") && method.equals("GET")) { requests(x, user, false); return; }
        if (path.equals("/api/history") && method.equals("GET")) { requests(x, user, true); return; }
        if (path.equals("/api/requests") && method.equals("POST")) { createRequest(x, user, body); return; }
        if (path.startsWith("/api/requests/") && method.equals("PUT")) { updateRequest(x, user, decode(path.substring("/api/requests/".length())), body); return; }
        if (path.startsWith("/api/requests/") && method.equals("POST") && path.endsWith("/accept")) { requireAdmin(user); statusRequest(x, path, "Processing"); return; }
        if (path.startsWith("/api/requests/") && method.equals("POST") && path.endsWith("/complete")) { requireAdmin(user); statusRequest(x, path, "Completed"); return; }
        if (path.equals("/api/profile") && method.equals("PUT")) { updateProfile(x, user, body); return; }
        if (path.equals("/api/password") && method.equals("PUT")) { changePassword(x, user, body); return; }
        if (path.equals("/api/notifications") && method.equals("GET")) { notifications(x, user); return; }
        throw new ApiException(404, "API endpoint not found.");
    }

    private static void login(HttpExchange x, JsonObject b) throws Exception {
        String ip = Optional.ofNullable(x.getRemoteAddress()).map(a -> a.getAddress().getHostAddress()).orElse("unknown");
        Attempt attempt = ATTEMPTS.computeIfAbsent(ip, k -> new Attempt());
        synchronized (attempt) {
            long now = System.currentTimeMillis();
            if (now < attempt.lockedUntil) throw new ApiException(429, "Too many failed attempts. Please try again in a short while.");
        }
        String username = str(b, "username").trim();
        String password = str(b, "password");
        String role = "ADMIN".equalsIgnoreCase(str(b, "role")) ? "ADMIN" : "RESIDENT";
        if (username.isBlank() || password.isBlank()) throw new ApiException(400, "Enter your username and password.");
        User user;
        String salt, hash;
        try (Connection c = db(); PreparedStatement p = c.prepareStatement("SELECT role,username,password_salt,password_hash,full_name,purok,contact,address FROM app_users WHERE LOWER(username)=LOWER(?)")) {
            p.setString(1, username);
            try (ResultSet r = p.executeQuery()) {
                if (!r.next()) { failed(attempt); throw new ApiException(401, "Incorrect username or password."); }
                String foundRole = r.getString(1);
                salt = r.getString(3); hash = r.getString(4);
                if (!role.equals(foundRole) || !constantEquals(hash(salt, password), hash)) {
                    failed(attempt); throw new ApiException(401, role.equals("ADMIN") && "RESIDENT".equals(foundRole) ? "This is a resident account. Choose Resident Sign In." : "Incorrect username or password.");
                }
                user = new User(foundRole, r.getString(2), r.getString(5), r.getString(6), r.getString(7), r.getString(8));
            }
        }
        synchronized (attempt) { attempt.count = 0; attempt.lockedUntil = 0; }
        String token = UUID.randomUUID().toString();
        SESSIONS.put(token, new Session(user, System.currentTimeMillis()));
        setCookie(x, token);
        json(x, 200, userJson(user));
    }

    private static void failed(Attempt a) { synchronized (a) { a.count++; if (a.count >= 5) { a.count = 0; a.lockedUntil = System.currentTimeMillis() + 30_000; } } }

    private static void register(HttpExchange x, JsonObject b) throws Exception {
        String full = str(b,"fullName").trim(), purok = str(b,"purok").trim(), contact = str(b,"contact").trim(), address = str(b,"address").trim();
        String username = str(b,"username").trim(), password = str(b,"password"), confirm = str(b,"confirm");
        if (full.length() < 3) throw new ApiException(400, "Please enter your full name.");
        if (!contact.matches("^(09\\d{9}|\\+639\\d{9})$")) throw new ApiException(400, "Enter a valid mobile number (e.g. 09171234567).");
        if (address.isBlank()) throw new ApiException(400, "Please enter your address.");
        if (!username.matches("^[A-Za-z0-9_.]{4,20}$")) throw new ApiException(400, "Username must be 4-20 characters (letters, numbers, _ or .).");
        if (password.length() < 6) throw new ApiException(400, "Password must be at least 6 characters.");
        if (!password.equals(confirm)) throw new ApiException(400, "Passwords do not match.");
        String salt = salt();
        try (Connection c = db(); PreparedStatement p = c.prepareStatement("INSERT INTO app_users(role,username,password_salt,password_hash,full_name,purok,contact,address) VALUES('RESIDENT',?,?,?,?,?,?,?)")) {
            p.setString(1, username); p.setString(2, salt); p.setString(3, hash(salt,password)); p.setString(4, full); p.setString(5,purok); p.setString(6,contact); p.setString(7,address); p.executeUpdate();
        } catch (SQLException e) { if ("23505".equals(e.getSQLState())) throw new ApiException(409,"That username is already taken."); throw e; }
        json(x, 201, obj("message", "Resident account created. You can now sign in."));
    }

    private static void logout(HttpExchange x) throws IOException {
        String token = cookie(x, "BKSESSION"); if (token != null) SESSIONS.remove(token);
        setExpiredCookie(x); json(x, 200, obj("ok", true));
    }

    private static User requireUser(HttpExchange x) {
        String token = cookie(x,"BKSESSION"); Session s = token == null ? null : SESSIONS.get(token);
        if (s == null) throw new ApiException(401,"Please sign in to continue.");
        if (System.currentTimeMillis() - s.created > 12L*60*60*1000) { SESSIONS.remove(token); throw new ApiException(401,"Your session expired. Please sign in again."); }
        return s.user;
    }
    private static void requireAdmin(User u) { if (!u.admin()) throw new ApiException(403,"This action is available to barangay staff only."); }

    private static void dashboard(HttpExchange x, User u) throws Exception {
        int residentCount = 0, availableDocs = 0, activeRequests = 0, completedRequests = 0, activeAnnouncements = 0;
        try (Connection c = db()) {
            if (u.admin()) try (PreparedStatement p = c.prepareStatement("SELECT COUNT(*) FROM app_users WHERE role='RESIDENT'" ); ResultSet r=p.executeQuery()) { if(r.next()) residentCount=r.getInt(1); }
            try (PreparedStatement p = c.prepareStatement("SELECT COUNT(*) FROM list_items WHERE category='documents' AND LOWER(row_data[4])='available'"); ResultSet r=p.executeQuery()) { if(r.next()) availableDocs=r.getInt(1); }
            String requestSql = u.admin() ? "SELECT COUNT(*) FROM document_requests WHERE LOWER(status)<>'completed'" : "SELECT COUNT(*) FROM document_requests WHERE LOWER(status)<>'completed' AND LOWER(resident_name)=LOWER(?)";
            try (PreparedStatement p=c.prepareStatement(requestSql)) { if(!u.admin()) p.setString(1,u.fullName()); try(ResultSet r=p.executeQuery()){if(r.next())activeRequests=r.getInt(1);} }
            String completedSql = u.admin() ? "SELECT COUNT(*) FROM document_requests WHERE LOWER(status)='completed'" : "SELECT COUNT(*) FROM document_requests WHERE LOWER(status)='completed' AND LOWER(resident_name)=LOWER(?)";
            try (PreparedStatement p=c.prepareStatement(completedSql)) { if(!u.admin()) p.setString(1,u.fullName()); try(ResultSet r=p.executeQuery()){if(r.next())completedRequests=r.getInt(1);} }
        }
        List<Map<String,Object>> anns = listAnnouncements();
        activeAnnouncements = (int) anns.stream().filter(a -> "Active".equalsIgnoreCase(String.valueOf(a.get("status")))).count();
        Map<String,Object> out = new LinkedHashMap<>();
        out.put("residentCount",residentCount); out.put("availableDocuments",availableDocs); out.put("activeRequests",activeRequests); out.put("completedRequests",completedRequests); out.put("activeAnnouncements",activeAnnouncements); out.put("recentAnnouncements",anns.stream().limit(5).toList());
        json(x,200,out);
    }

    private static void residents(HttpExchange x) throws Exception {
        List<Map<String,Object>> out = new ArrayList<>();
        try (Connection c=db(); PreparedStatement p=c.prepareStatement("SELECT username,full_name,purok,contact,address FROM app_users WHERE role='RESIDENT' ORDER BY NULLIF(regexp_replace(COALESCE(purok,''),'[^0-9]','','g'),'')::int NULLS LAST, full_name"); ResultSet r=p.executeQuery()) {
            int i=1; while(r.next()) out.add(obj("id",String.format("R-%03d",i++),"username",r.getString(1),"fullName",r.getString(2),"purok",r.getString(3),"contact",r.getString(4),"address",r.getString(5)));
        }
        json(x,200,out);
    }
    private static void createResident(HttpExchange x, JsonObject b) throws Exception {
        String full=str(b,"fullName").trim(), purok=str(b,"purok").trim(), contact=str(b,"contact").trim(), address=str(b,"address").trim(), username=str(b,"username").trim();
        if(full.length()<3)throw new ApiException(400,"Enter the resident's full name.");
        if(!contact.matches("^(09\\d{9}|\\+639\\d{9})$"))throw new ApiException(400,"Enter a valid mobile number.");
        if(address.isBlank())throw new ApiException(400,"Enter the address.");
        if(!username.matches("^[A-Za-z0-9_.]{4,20}$"))throw new ApiException(400,"Username must be 4-20 characters.");
        String temp="res"+username.substring(0,4)+"123", salt=salt();
        try(Connection c=db();PreparedStatement p=c.prepareStatement("INSERT INTO app_users(role,username,password_salt,password_hash,full_name,purok,contact,address) VALUES('RESIDENT',?,?,?,?,?,?,?)")){
            p.setString(1,username);p.setString(2,salt);p.setString(3,hash(salt,temp));p.setString(4,full);p.setString(5,purok);p.setString(6,contact);p.setString(7,address);p.executeUpdate();
        }catch(SQLException e){if("23505".equals(e.getSQLState()))throw new ApiException(409,"That username is already taken.");throw e;}
        json(x,201,obj("message","Resident account created.","temporaryPassword",temp));
    }
    private static void ensureArchiveTable() throws SQLException {
        if (ARCHIVE_TABLE_READY) return;
        synchronized (BaryoKonekWebServer.class) {
            if (ARCHIVE_TABLE_READY) return;
            String sql = "CREATE TABLE IF NOT EXISTS archived_residents ("
                + "archive_id BIGSERIAL PRIMARY KEY,"
                + "username VARCHAR(20) NOT NULL,"
                + "password_salt TEXT NOT NULL,"
                + "password_hash TEXT NOT NULL,"
                + "full_name TEXT NOT NULL,"
                + "purok TEXT,"
                + "contact VARCHAR(20),"
                + "address TEXT,"
                + "archived_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,"
                + "archived_by VARCHAR(20) NOT NULL"
                + ")";
            try (Connection c = db(); Statement statement = c.createStatement()) {
                statement.executeUpdate(sql);
            }
            ARCHIVE_TABLE_READY = true;
        }
    }

    private static void archiveResident(HttpExchange x, String username, String archivedBy) throws Exception {
        if (username == null || username.isBlank()) throw new ApiException(400, "Resident username is required.");
        ensureArchiveTable();
        try (Connection c = db()) {
            c.setAutoCommit(false);
            try {
                String salt;
                String passwordHash;
                String fullName;
                String purok;
                String contact;
                String address;
                try (PreparedStatement select = c.prepareStatement(
                    "SELECT username,password_salt,password_hash,full_name,purok,contact,address "
                    + "FROM app_users WHERE username=? AND role='RESIDENT' FOR UPDATE")) {
                    select.setString(1, username);
                    try (ResultSet result = select.executeQuery()) {
                        if (!result.next()) throw new ApiException(404, "Resident account not found.");
                        salt = result.getString("password_salt");
                        passwordHash = result.getString("password_hash");
                        fullName = result.getString("full_name");
                        purok = result.getString("purok");
                        contact = result.getString("contact");
                        address = result.getString("address");
                    }
                }
                try (PreparedStatement insert = c.prepareStatement(
                    "INSERT INTO archived_residents(username,password_salt,password_hash,full_name,purok,contact,address,archived_by) "
                    + "VALUES(?,?,?,?,?,?,?,?)")) {
                    insert.setString(1, username);
                    insert.setString(2, salt);
                    insert.setString(3, passwordHash);
                    insert.setString(4, fullName);
                    insert.setString(5, purok);
                    insert.setString(6, contact);
                    insert.setString(7, address);
                    insert.setString(8, archivedBy);
                    insert.executeUpdate();
                }
                try (PreparedStatement delete = c.prepareStatement("DELETE FROM app_users WHERE username=? AND role='RESIDENT'")) {
                    delete.setString(1, username);
                    if (delete.executeUpdate() != 1) throw new SQLException("Resident account could not be moved to archive.");
                }
                c.commit();
            } catch (Exception error) {
                try { c.rollback(); } catch (SQLException ignored) { }
                throw error;
            }
        }
        json(x, 200, obj("ok", true, "message", "Resident account archived."));
    }

    private static List<ListItem> getList(String category)throws Exception{
        List<ListItem> out=new ArrayList<>();
        try(Connection c=db();PreparedStatement p=c.prepareStatement("SELECT id,row_data FROM list_items WHERE category=? ORDER BY id")){p.setString(1,category);try(ResultSet r=p.executeQuery()){while(r.next()){java.sql.Array a=r.getArray(2);String[] v=(String[])a.getArray();out.add(new ListItem(r.getLong(1),category,Arrays.asList(v)));a.free();}}}
        return out;
    }
    private static void insertList(String category,List<String> vals)throws Exception{
        try(Connection c=db();PreparedStatement p=c.prepareStatement("INSERT INTO list_items(category,row_data) VALUES(?,?)")){p.setString(1,category);p.setArray(2,c.createArrayOf("text",vals.toArray(String[]::new)));p.executeUpdate();}
    }
    private static void updateList(long id,String category,List<String> vals)throws Exception{
        try(Connection c=db();PreparedStatement p=c.prepareStatement("UPDATE list_items SET row_data=? WHERE id=? AND category=?")){p.setArray(1,c.createArrayOf("text",vals.toArray(String[]::new)));p.setLong(2,id);p.setString(3,category);if(p.executeUpdate()==0)throw new ApiException(404,"Item not found.");}
    }
    private static void deleteListItem(HttpExchange x,String category,long id)throws Exception{
        try(Connection c=db();PreparedStatement p=c.prepareStatement("DELETE FROM list_items WHERE id=? AND category=?")){p.setLong(1,id);p.setString(2,category);if(p.executeUpdate()==0)throw new ApiException(404,"Item not found.");}
        json(x,200,obj("ok",true));
    }
    private static void documents(HttpExchange x)throws Exception{
        List<Map<String,Object>> out=new ArrayList<>();for(ListItem i:getList("documents")){List<String> v=i.values();out.add(obj("id",i.id(),"name",at(v,0),"description",at(v,1),"requirements",at(v,2),"availability",at(v,3)));}json(x,200,out);
    }
    private static void createDocument(HttpExchange x,JsonObject b)throws Exception{
        String name=str(b,"name").trim();if(name.isBlank())throw new ApiException(400,"Enter the document name.");
        insertList("documents",List.of(name,str(b,"description"),str(b,"requirements"),allowed(str(b,"availability"),"Available","Unavailable"),"Edit / Delete"));json(x,201,obj("ok",true));
    }
    private static void updateDocument(HttpExchange x,long id,JsonObject b)throws Exception{
        String name=str(b,"name").trim();if(name.isBlank())throw new ApiException(400,"Enter the document name.");
        updateList(id,"documents",List.of(name,str(b,"description"),str(b,"requirements"),allowed(str(b,"availability"),"Available","Unavailable"),"Edit / Delete"));json(x,200,obj("ok",true));
    }
    private static void announcements(HttpExchange x)throws Exception{json(x,200,listAnnouncements());}
    private static List<Map<String,Object>> listAnnouncements()throws Exception{
        List<Map<String,Object>> out=new ArrayList<>();
        for(String key:List.of("announcements","health","education"))for(ListItem i:getList(key)){
            List<String> v=i.values();boolean barangay=key.equals("announcements");
            String category=barangay?"Barangay":(key.equals("health")?"Health":"Education");
            boolean legacyService=!barangay && v.size()==5;
            String title=at(v,0),date=at(v,barangay?1:2),status=at(v,barangay?2:(legacyService?3:4)),location=at(v,barangay?4:(legacyService?3:3));
            if (legacyService) location="";
            out.add(obj("id",i.id(),"store",key,"category",category,"title",title,"date",date,"location",location,"status",status));
        }
        out.sort((a,b)->String.valueOf(b.get("date")).compareToIgnoreCase(String.valueOf(a.get("date"))));return out;
    }
    private static void createAnnouncement(HttpExchange x,JsonObject b)throws Exception{
        String category=allowed(str(b,"category"),"Barangay","Health","Education"),title=str(b,"title").trim();if(title.isBlank())throw new ApiException(400,"Enter the announcement title.");
        String date=str(b,"date").isBlank()?LocalDate.now().format(DateTimeFormatter.ofPattern("MMM dd, yyyy",Locale.ENGLISH)):str(b,"date");
        String location=str(b,"location"),status=allowed(str(b,"status"),"Active","Inactive"),uuid=UUID.randomUUID().toString();
        if(category.equals("Barangay"))insertList("announcements",List.of(title,date,status,"Edit / Delete",location,uuid));
        else insertList(category.equals("Health")?"health":"education",Arrays.asList(title,"General",date,location,status,"Edit / Delete",uuid));
        json(x,201,obj("ok",true));
    }
    private static void updateAnnouncement(HttpExchange x,long id,JsonObject b)throws Exception{
        String store=allowed(str(b,"store"),"announcements","health","education"),title=str(b,"title").trim();if(title.isBlank())throw new ApiException(400,"Enter the announcement title.");
        String date=str(b,"date"),location=str(b,"location"),status=allowed(str(b,"status"),"Active","Inactive");
        List<String> old=findListItem(id,store);if(old==null)throw new ApiException(404,"Announcement not found.");
        List<String> vals;
        if(store.equals("announcements")){vals=new ArrayList<>(old);while(vals.size()<6)vals.add("");vals.set(0,title);vals.set(1,date);vals.set(2,status);vals.set(3,"Edit / Delete");vals.set(4,location);if(vals.get(5).isBlank())vals.set(5,UUID.randomUUID().toString());}
        else{vals=new ArrayList<>(old);while(vals.size()<7)vals.add("");vals.set(0,title);vals.set(2,date);vals.set(3,location);vals.set(4,status);vals.set(5,"Edit / Delete");if(vals.get(6).isBlank())vals.set(6,UUID.randomUUID().toString());}
        updateList(id,store,vals);json(x,200,obj("ok",true));
    }
    private static void deleteAnnouncement(HttpExchange x,long id)throws Exception{
        String store=query(x).getOrDefault("store", "");if(!Set.of("announcements","health","education").contains(store))throw new ApiException(400,"Invalid announcement category.");deleteListItem(x,store,id);
    }
    private static List<String> findListItem(long id,String store)throws Exception{for(ListItem i:getList(store))if(i.id()==id)return i.values();return null;}

    private static void requests(HttpExchange x,User u,boolean history)throws Exception{
        List<Map<String,Object>> out=new ArrayList<>();String qcol=hasQuantity()?"quantity":"1 AS quantity";
        String sql="SELECT request_id,document_type,resident_name,purpose,request_date,status,"+qcol+" FROM document_requests"+(u.admin()?"":" WHERE LOWER(resident_name)=LOWER(?)")+" ORDER BY request_date DESC,request_id DESC";
        try(Connection c=db();PreparedStatement p=c.prepareStatement(sql)){if(!u.admin())p.setString(1,u.fullName());try(ResultSet r=p.executeQuery()){while(r.next()){
            boolean completed="Completed".equalsIgnoreCase(r.getString(6));if(completed!=history)continue;
            out.add(obj("id",r.getString(1),"documentType",r.getString(2),"residentName",r.getString(3),"purpose",r.getString(4),"date",r.getString(5),"status",r.getString(6),"quantity",r.getInt(7)));
        }}}
        json(x,200,out);
    }
    private static void createRequest(HttpExchange x,User u,JsonObject b)throws Exception{
        if(u.admin())throw new ApiException(403,"Only resident accounts can submit document requests.");
        String type=str(b,"documentType").trim(),purpose=str(b,"purpose").trim();int quantity=Math.max(1,Math.min(100,intVal(b,"quantity",1)));
        if(type.isBlank()||purpose.isBlank())throw new ApiException(400,"Select a document and enter the purpose.");
        boolean available=false;for(ListItem i:getList("documents"))if(at(i.values(),0).equalsIgnoreCase(type)&&"Available".equalsIgnoreCase(at(i.values(),3)))available=true;
        if(!available)throw new ApiException(409,"This document is no longer available. Please refresh and select an available document.");
        String id="REQ-"+DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").format(LocalDateTime.now())+"-"+UUID.randomUUID().toString().substring(0,4).toUpperCase(Locale.ROOT);
        String date=LocalDate.now().format(DateTimeFormatter.ofPattern("MMM dd, yyyy",Locale.ENGLISH));
        String insertSql=hasQuantity()?"INSERT INTO document_requests(request_id,document_type,resident_name,purpose,request_date,status,quantity) VALUES(?,?,?,?,?,'For Acceptance',?)":"INSERT INTO document_requests(request_id,document_type,resident_name,purpose,request_date,status) VALUES(?,?,?,?,?,'For Acceptance')";
        try(Connection c=db();PreparedStatement p=c.prepareStatement(insertSql)){
            p.setString(1,id);p.setString(2,type);p.setString(3,u.fullName());p.setString(4,purpose);p.setString(5,date);if(hasQuantity())p.setInt(6,quantity);p.executeUpdate();
        }json(x,201,obj("id",id,"message","Your document request was submitted."));
    }
    private static void updateRequest(HttpExchange x,User u,String id,JsonObject b)throws Exception{
        if(u.admin()) throw new ApiException(403,"Only the resident who submitted the request can edit it.");
        String type=str(b,"documentType").trim(),purpose=str(b,"purpose").trim();int q=Math.max(1,Math.min(100,intVal(b,"quantity",1)));
        if(purpose.isBlank()||type.isBlank())throw new ApiException(400,"Document type and purpose are required.");
        String currentType=null;
        try(Connection c=db();PreparedStatement p=c.prepareStatement("SELECT document_type FROM document_requests WHERE request_id=? AND LOWER(resident_name)=LOWER(?) AND LOWER(status)='for acceptance'")){p.setString(1,id);p.setString(2,u.fullName());try(ResultSet r=p.executeQuery()){if(r.next())currentType=r.getString(1);}}
        if(currentType==null)throw new ApiException(409,"This request can only be edited before staff accepts it.");
        if(!currentType.equalsIgnoreCase(type)) { boolean available=false; for(ListItem item:getList("documents")) if(at(item.values(),0).equalsIgnoreCase(type)&&"Available".equalsIgnoreCase(at(item.values(),3))) available=true; if(!available)throw new ApiException(409,"This document is not currently available."); }
        boolean qty=hasQuantity();String sql="UPDATE document_requests SET document_type=?,purpose=?"+(qty?",quantity=?":"")+" WHERE request_id=? AND LOWER(resident_name)=LOWER(?) AND LOWER(status)='for acceptance'";
        try(Connection c=db();PreparedStatement p=c.prepareStatement(sql)){p.setString(1,type);p.setString(2,purpose);int ix=3;if(qty)p.setInt(ix++,q);p.setString(ix++,id);p.setString(ix,u.fullName());if(p.executeUpdate()==0)throw new ApiException(409,"This request can only be edited before staff accepts it.");}
        json(x,200,obj("ok",true));
    }
    private static void statusRequest(HttpExchange x,String path,String status)throws Exception{
        String[] parts=path.split("/");if(parts.length<5)throw new ApiException(400,"Invalid request ID.");String id=decode(parts[3]);
        String expected=status.equals("Processing")?"For Acceptance":"Processing";
        String sql="UPDATE document_requests SET status=?"+(hasCompletedAt()?", completed_at="+(status.equals("Completed")?"CURRENT_TIMESTAMP":"NULL"):"")+" WHERE request_id=? AND LOWER(status)=LOWER(?)";
        try(Connection c=db();PreparedStatement p=c.prepareStatement(sql)){p.setString(1,status);p.setString(2,id);p.setString(3,expected);if(p.executeUpdate()==0)throw new ApiException(409,"The request status has changed. Refresh the list and try again.");}
        json(x,200,obj("ok",true,"status",status));
    }

    private static void updateProfile(HttpExchange x,User u,JsonObject b)throws Exception{
        if(u.admin())throw new ApiException(403,"Admin profile details are read-only here.");
        String full=str(b,"fullName").trim(),purok=str(b,"purok").trim(),contact=str(b,"contact").trim(),address=str(b,"address").trim();
        if(full.length()<3)throw new ApiException(400,"Enter your full name (at least 3 characters).");if(!contact.matches("^(09\\d{9}|\\+639\\d{9})$"))throw new ApiException(400,"Enter a valid mobile number.");if(address.isBlank())throw new ApiException(400,"Enter your address.");
        try(Connection c=db();PreparedStatement p=c.prepareStatement("UPDATE app_users SET full_name=?,purok=?,contact=?,address=? WHERE username=? AND role='RESIDENT'")){p.setString(1,full);p.setString(2,purok);p.setString(3,contact);p.setString(4,address);p.setString(5,u.username());p.executeUpdate();}
        refreshSessionUser(x,u.username());json(x,200,obj("ok",true));
    }
    private static void changePassword(HttpExchange x,User u,JsonObject b)throws Exception{
        String old=str(b,"currentPassword"),next=str(b,"newPassword"),confirm=str(b,"confirmPassword");
        if(next.length()<6)throw new ApiException(400,"New password must be at least 6 characters.");if(!next.equals(confirm))throw new ApiException(400,"New passwords do not match.");
        String salt,oldHash;try(Connection c=db();PreparedStatement p=c.prepareStatement("SELECT password_salt,password_hash FROM app_users WHERE username=?")){p.setString(1,u.username());try(ResultSet r=p.executeQuery()){if(!r.next())throw new ApiException(401,"Account not found.");salt=r.getString(1);oldHash=r.getString(2);}}
        if(!constantEquals(hash(salt,old),oldHash))throw new ApiException(400,"Current password is incorrect.");
        String newSalt=salt();try(Connection c=db();PreparedStatement p=c.prepareStatement("UPDATE app_users SET password_salt=?,password_hash=? WHERE username=?")){p.setString(1,newSalt);p.setString(2,hash(newSalt,next));p.setString(3,u.username());p.executeUpdate();}
        json(x,200,obj("ok",true));
    }
    private static void refreshSessionUser(HttpExchange x,String username)throws Exception{
        String token=cookie(x,"BKSESSION");if(token==null)return;
        try(Connection c=db();PreparedStatement p=c.prepareStatement("SELECT role,username,full_name,purok,contact,address FROM app_users WHERE username=?")){p.setString(1,username);try(ResultSet r=p.executeQuery()){if(r.next())SESSIONS.put(token,new Session(new User(r.getString(1),r.getString(2),r.getString(3),r.getString(4),r.getString(5),r.getString(6)),System.currentTimeMillis()));}}
    }
    private static void notifications(HttpExchange x,User u)throws Exception{
        List<Map<String,Object>> out=new ArrayList<>();
        String ccol=hasCompletedAt()?"completed_at":"NULL::timestamp AS completed_at";
        String sql="SELECT request_id,document_type,request_date,"+ccol+" FROM document_requests WHERE LOWER(status)='completed'"+(u.admin()?"":" AND LOWER(resident_name)=LOWER(?)")+" ORDER BY 4 DESC NULLS LAST";
        try(Connection c=db();PreparedStatement p=c.prepareStatement(sql)){if(!u.admin())p.setString(1,u.fullName());try(ResultSet r=p.executeQuery()){while(r.next())out.add(obj("key","request:"+r.getString(1)+":"+String.valueOf(r.getTimestamp(4)),"kind","request","title","Document request completed","message",r.getString(2)+" has been completed.","date",r.getString(3)));}}
        if(!u.admin())for(Map<String,Object>a:listAnnouncements())if("Active".equalsIgnoreCase(String.valueOf(a.get("status"))))out.add(obj("key","announcement:"+a.get("id"),"kind","announcement","title","New "+a.get("category")+" announcement","message",a.get("title"),"date",a.get("date")));
        json(x,200,out);
    }

    private static void enforceSameOrigin(HttpExchange x, String method) {
        if (!Set.of("POST", "PUT", "PATCH", "DELETE").contains(method)) return;
        String origin = x.getRequestHeaders().getFirst("Origin");
        String host = x.getRequestHeaders().getFirst("Host");
        if (origin == null || host == null) return;
        try {
            String authority = URI.create(origin).getRawAuthority();
            if (authority == null || !authority.equalsIgnoreCase(host)) throw new ApiException(403, "Cross-origin request blocked.");
        } catch (IllegalArgumentException e) {
            throw new ApiException(403, "Invalid request origin.");
        }
    }

    private static JsonObject readJson(HttpExchange x)throws IOException{
        if(!"POST".equalsIgnoreCase(x.getRequestMethod())&& !"PUT".equalsIgnoreCase(x.getRequestMethod()))return new JsonObject();
        byte[] bytes=x.getRequestBody().readNBytes(1_000_001);if(bytes.length>1_000_000)throw new ApiException(413,"Request is too large.");if(bytes.length==0)return new JsonObject();
        try{JsonElement e=JsonParser.parseString(new String(bytes,StandardCharsets.UTF_8));return e.isJsonObject()?e.getAsJsonObject():new JsonObject();}catch(Exception e){throw new ApiException(400,"Invalid JSON request.");}
    }
    private static String str(JsonObject o,String key){return o.has(key)&&!o.get(key).isJsonNull()?o.get(key).getAsString():"";}
    private static int intVal(JsonObject o,String key,int d){try{return o.get(key).getAsInt();}catch(Exception e){return d;}}
    private static String at(List<String> v,int i){return i>=0&&i<v.size()&&v.get(i)!=null?v.get(i):"";}
    private static String allowed(String v,String... options){for(String o:options)if(o.equalsIgnoreCase(v))return o;return options[0];}
    private static Map<String,Object> obj(Object... pairs){Map<String,Object> o=new LinkedHashMap<>();for(int i=0;i+1<pairs.length;i+=2)o.put(pairs[i].toString(),pairs[i+1]);return o;}
    private static Map<String,Object> userJson(User u){return obj("role",u.role(),"username",u.username(),"fullName",u.fullName(),"purok",u.purok(),"contact",u.contact(),"address",u.address());}
    private static String salt(){byte[] s=new byte[16];new SecureRandom().nextBytes(s);return Base64.getEncoder().encodeToString(s);}
    private static String hash(String salt,String password){try{MessageDigest md=MessageDigest.getInstance("SHA-256");byte[] d=(salt+password).getBytes(StandardCharsets.UTF_8);for(int i=0;i<20000;i++)d=md.digest(d);return Base64.getEncoder().encodeToString(d);}catch(Exception e){throw new RuntimeException(e);}}
    private static boolean constantEquals(String a,String b){return a!=null&&b!=null&&MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8),b.getBytes(StandardCharsets.UTF_8));}
    private static String cookie(HttpExchange x,String name){List<String> hs=x.getRequestHeaders().get("Cookie");if(hs==null)return null;for(String h:hs)for(String part:h.split(";")){String[] kv=part.trim().split("=",2);if(kv.length==2&&kv[0].equals(name))return kv[1];}return null;}
    private static void setCookie(HttpExchange x,String token){x.getResponseHeaders().add("Set-Cookie","BKSESSION="+token+"; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200"+(SECURE_COOKIE?"; Secure":""));}
    private static void setExpiredCookie(HttpExchange x){x.getResponseHeaders().add("Set-Cookie","BKSESSION=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"+(SECURE_COOKIE?"; Secure":""));}
    private static long parseId(String path){String s=path.substring(path.lastIndexOf('/')+1);try{return Long.parseLong(s);}catch(Exception e){throw new ApiException(400,"Invalid item ID.");}}
    private static String decode(String s){try{return URLDecoder.decode(s,StandardCharsets.UTF_8);}catch(Exception e){return s;}}
    private static Map<String,String> query(HttpExchange x){Map<String,String> q=new HashMap<>();String raw=x.getRequestURI().getRawQuery();if(raw!=null)for(String p:raw.split("&")){String[] kv=p.split("=",2);q.put(decode(kv[0]),kv.length>1?decode(kv[1]):"");}return q;}
    private static void json(HttpExchange x,int status,Object data)throws IOException{bytes(x,status,"application/json; charset=utf-8",GSON.toJson(data).getBytes(StandardCharsets.UTF_8));}
    private static void bytes(HttpExchange x,int status,String type,String body)throws IOException{bytes(x,status,type,body.getBytes(StandardCharsets.UTF_8));}
    private static void bytes(HttpExchange x,int status,String type,byte[] body)throws IOException{
        Headers h=x.getResponseHeaders();h.set("Content-Type",type);h.set("X-Content-Type-Options","nosniff");h.set("X-Frame-Options","DENY");h.set("Referrer-Policy","strict-origin-when-cross-origin");h.set("Cache-Control","no-store");
        h.set("Content-Security-Policy","default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'");
        h.set("Cross-Origin-Resource-Policy", "same-origin");
        if (SECURE_COOKIE) h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
        x.sendResponseHeaders(status,body.length);try(OutputStream out=x.getResponseBody()){out.write(body);}
    }
    static class ApiException extends RuntimeException{final int status;ApiException(int s,String m){super(m);status=s;}}
}
