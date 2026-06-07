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
    if (!hasValidApiKey(request)) {
      response.setStatus(401);
      response.setContentType("application/json");
      mapper.writeValue(response.getWriter(), Map.of(
          "success", false,
          "errorCode", "UNAUTHORIZED",
          "error", "Unauthorized",
          "message", "Missing or invalid API key. Send x-api-key header or Authorization: Bearer token."));
      return;
    }
    chain.doFilter(request, response);
  }

  private boolean hasValidApiKey(HttpServletRequest request) {
    String expectedApiKey = properties.getApiKey();
    String headerApiKey = request.getHeader("x-api-key");
    String bearerApiKey = bearerToken(request.getHeader("Authorization"));
    return expectedApiKey != null && (expectedApiKey.equals(headerApiKey) || expectedApiKey.equals(bearerApiKey));
  }

  private String bearerToken(String authorizationHeader) {
    if (authorizationHeader == null || !authorizationHeader.startsWith("Bearer ")) {
      return null;
    }
    return authorizationHeader.substring("Bearer ".length()).trim();
  }
}
