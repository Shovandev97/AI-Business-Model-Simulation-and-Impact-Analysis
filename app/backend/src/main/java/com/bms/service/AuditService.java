package com.bms.service;

import com.bms.repository.JsonStoreRepository;
import com.bms.util.Json;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Map;

@Service
public class AuditService {
  private final JsonStoreRepository repository;

  public AuditService(JsonStoreRepository repository) {
    this.repository = repository;
  }

  public Map<String, Object> audit(String action, Map<String, Object> payload) {
    Map<String, Object> entry = Json.obj(
        "id", Json.id(),
        "action", action,
        "timestamp", Instant.now().toString(),
        "modelVersion", payload.getOrDefault("modelVersion", null),
        "promptVersion", payload.getOrDefault("promptVersion", null),
        "request", payload.getOrDefault("request", null),
        "response", payload.getOrDefault("response", null));
    repository.mutate(state -> {
      var audits = new ArrayList<>(JsonStoreRepository.collection(state, "audits"));
      audits.add(0, entry);
      state.put("audits", audits.size() > 500 ? audits.subList(0, 500) : audits);
      return entry;
    });
    return entry;
  }

  public Object listAudit() {
    return repository.read().get("audits");
  }
}
