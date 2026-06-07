package com.bms.service;

import com.bms.config.BmsProperties;
import com.bms.util.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.Map;

@Service
public class MlClient {
  private final RestClient restClient;
  private final BmsProperties properties;

  public MlClient(RestClient.Builder builder, BmsProperties properties) {
    this.restClient = builder.build();
    this.properties = properties;
  }

  @SuppressWarnings("unchecked")
  public Map<String, Object> predictScenario(Map<String, Object> scenario) {
    try {
      return restClient.post().uri(properties.getMlServiceUrl() + "/ml/predict").body(scenario).retrieve().body(Map.class);
    } catch (Exception error) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "ML service returned an error: " + error.getMessage());
    }
  }

  @SuppressWarnings("unchecked")
  public Map<String, Object> trainModel(Map<String, Object> options) {
    return restClient.post().uri(properties.getMlServiceUrl() + "/ml/train").body(options).retrieve().body(Map.class);
  }

  @SuppressWarnings("unchecked")
  public Map<String, Object> getModelInfo() {
    return restClient.get().uri(properties.getMlServiceUrl() + "/ml/model-info").retrieve().body(Map.class);
  }
}
