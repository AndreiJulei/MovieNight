# Backend image for Render (free web service). Built from repo/MovieNightBackend.
FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN ./mvnw -q -B dependency:go-offline
COPY src src
# Tests run in CI before deploy; the image build only packages.
RUN ./mvnw -q -B -DskipTests package && cp target/movienight-backend-*.jar /app.jar

FROM eclipse-temurin:21-jre
RUN useradd --system --uid 10001 app
USER app
COPY --from=build /app.jar /app.jar
# Render free instances have 512 MB RAM: cap the heap and use the small collector.
ENV JAVA_TOOL_OPTIONS="-Xmx340m -XX:+UseSerialGC -XX:TieredStopAtLevel=1"
EXPOSE 8080
ENTRYPOINT ["java","-jar","/app.jar","--spring.config.location=classpath:/application-postgres.properties","--spring.profiles.active=postgres"]
