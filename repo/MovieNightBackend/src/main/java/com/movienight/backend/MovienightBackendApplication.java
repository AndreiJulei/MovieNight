package com.movienight.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class MovienightBackendApplication {

	public static void main(String[] args) {
		SpringApplication.run(MovienightBackendApplication.class, args);
	}

}
