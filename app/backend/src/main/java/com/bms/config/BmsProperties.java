package com.bms.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "bms")
public class BmsProperties {
  private String apiKey = "local-dev-key";
  private String corsOrigin = "http://localhost:8080";
  private String mlServiceUrl = "http://localhost:5001";
  private String dataStorePath = "./data/store.json";
  private Ai ai = new Ai();

  public String getApiKey() { return apiKey; }
  public void setApiKey(String apiKey) { this.apiKey = apiKey; }
  public String getCorsOrigin() { return corsOrigin; }
  public void setCorsOrigin(String corsOrigin) { this.corsOrigin = corsOrigin; }
  public String getMlServiceUrl() { return mlServiceUrl; }
  public void setMlServiceUrl(String mlServiceUrl) { this.mlServiceUrl = mlServiceUrl; }
  public String getDataStorePath() { return dataStorePath; }
  public void setDataStorePath(String dataStorePath) { this.dataStorePath = dataStorePath; }
  public Ai getAi() { return ai; }
  public void setAi(Ai ai) { this.ai = ai; }

  public static class Ai {
    private String provider = "ollama";
    private String baseUrl = "http://localhost:11434/v1/chat/completions";
    private String apiKey = "";
    private String model = "qwen2.5:0.5b";
    private long timeoutMs = 120000;

    public String getProvider() { return provider; }
    public void setProvider(String provider) { this.provider = provider; }
    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }
    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }
    public long getTimeoutMs() { return timeoutMs; }
    public void setTimeoutMs(long timeoutMs) { this.timeoutMs = timeoutMs; }
  }
}
