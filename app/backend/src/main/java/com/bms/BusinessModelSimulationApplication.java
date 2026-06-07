package com.bms;

import com.bms.config.BmsProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(BmsProperties.class)
public class BusinessModelSimulationApplication {
  public static void main(String[] args) {
    SpringApplication.run(BusinessModelSimulationApplication.class, args);
  }
}
