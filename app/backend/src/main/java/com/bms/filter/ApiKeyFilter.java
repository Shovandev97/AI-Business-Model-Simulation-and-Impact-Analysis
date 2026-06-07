package com.bms.filter;

import com.bms.config.BmsProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;

public class ApiKeyFilter extends OncePerRequestFilter {
  private final BmsProperties properties;
  private final ObjectMapper mapper;

  public ApiKeyFilter(BmsProperties properties, ObjectMapper mapper) {
    this.properties = properties;
    this.mapper = mapper;
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    if ("OPTIONS".equals(request.getMethod()) || "/api/health".equals(request.getRequestURI())) {
      chain.doFilter(request, response);
      return;
    }
    if (!properties.getApiKey().equals(request.getHeader("x-api-key"))) {
      response.setStatus(401);
      response.setContentType("application/json");
      mapper.writeValue(response.getWriter(), Map.of(
          "success", false,
          "errorCode", "UNAUTHORIZED",
          "error", "Unauthorized",
          "message", "Missing or invalid x-api-key."));
      return;
    }
    chain.doFilter(request, response);
  }
}
