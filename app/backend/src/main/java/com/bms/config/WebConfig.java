package com.bms.config;

import com.bms.filter.ApiKeyFilter;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

import java.util.List;

@Configuration
public class WebConfig {
  @Bean
  public FilterRegistrationBean<CorsFilter> corsFilter(BmsProperties properties) {
    CorsConfiguration config = new CorsConfiguration();
    config.setAllowedOrigins(List.of(properties.getCorsOrigin()));
    config.setAllowedMethods(List.of("GET", "POST", "DELETE", "OPTIONS"));
    config.setAllowedHeaders(List.of("*"));
    config.setAllowCredentials(true);
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", config);
    FilterRegistrationBean<CorsFilter> bean = new FilterRegistrationBean<>(new CorsFilter(source));
    bean.setOrder(0);
    return bean;
  }

  @Bean
  public FilterRegistrationBean<ApiKeyFilter> apiKeyFilter(BmsProperties properties, ObjectMapper mapper) {
    ApiKeyFilter filter = new ApiKeyFilter(properties, mapper);
    FilterRegistrationBean<ApiKeyFilter> bean = new FilterRegistrationBean<>(filter);
    bean.setOrder(1);
    return bean;
  }
}
