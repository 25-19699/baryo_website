FROM maven:3.9-eclipse-temurin-25 AS build
WORKDIR /app
COPY . /tmp/repo
RUN mkdir -p src/main/java src/main/resources/static init \
 && cp /tmp/repo/pom.xml . \
 && cp /tmp/repo/BaryoKonekWebServer.java src/main/java/ \
 && cp /tmp/repo/app.css /tmp/repo/app.js /tmp/repo/index.html /tmp/repo/sw.js /tmp/repo/manifest.webmanifest /tmp/repo/barangay.jpg /tmp/repo/icon-192.png /tmp/repo/icon-512.png src/main/resources/static/ \
 && mvn -q clean package -DskipTests \
 && javac -d init /tmp/repo/InitDb.java

FROM eclipse-temurin:25-jre
WORKDIR /app
COPY --from=build /app/target/BaryoKonekWebServer.jar app.jar
COPY --from=build /app/init /app/init
CMD ["sh", "-c", "java -cp app.jar:init InitDb; exec java --add-modules jdk.httpserver -jar app.jar"]
