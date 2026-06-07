package com.bms.repository;

import com.bms.config.BmsProperties;
import com.bms.util.Json;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Repository;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

@Repository
public class JsonStoreRepository {
  private final ObjectMapper mapper;
  private final Path storePath;

  public JsonStoreRepository(ObjectMapper mapper, BmsProperties properties) {
    this.mapper = mapper;
    this.storePath = Path.of(properties.getDataStorePath()).toAbsolutePath().normalize();
  }

  public synchronized Map<String, Object> read() {
    ensureStore();
    try {
      Map<String, Object> state = mapper.readValue(storePath.toFile(), new TypeReference<>() {});
      initialState().forEach(state::putIfAbsent);
      return state;
    } catch (IOException error) {
      throw new IllegalStateException("Unable to read JSON store", error);
    }
  }

  public synchronized Object mutate(Function<Map<String, Object>, Object> mutator) {
    Map<String, Object> state = read();
    Object result = mutator.apply(state);
    write(state);
    return result;
  }

  public synchronized void write(Map<String, Object> state) {
    ensureStore();
    try {
      mapper.writerWithDefaultPrettyPrinter().writeValue(storePath.toFile(), state);
    } catch (IOException error) {
      throw new IllegalStateException("Unable to write JSON store", error);
    }
  }

  private void ensureStore() {
    try {
      Files.createDirectories(storePath.getParent());
      if (!Files.exists(storePath)) mapper.writerWithDefaultPrettyPrinter().writeValue(storePath.toFile(), initialState());
    } catch (IOException error) {
      throw new IllegalStateException("Unable to initialize JSON store", error);
    }
  }

  public static Map<String, Object> initialState() {
    return new LinkedHashMap<>(Json.obj(
        "scenarios", List.of(),
        "impacts", List.of(),
        "predictions", List.of(),
        "recommendations", List.of(),
        "suggestions", List.of(),
        "scenarioLinks", List.of(),
        "audits", List.of()));
  }

  @SuppressWarnings("unchecked")
  public static List<Map<String, Object>> collection(Map<String, Object> state, String key) {
    Object existing = state.get(key);
    if (!(existing instanceof java.util.ArrayList<?>)) {
      existing = new java.util.ArrayList<>(existing instanceof List<?> list ? list : List.of());
      state.put(key, existing);
    }
    return (List<Map<String, Object>>) existing;
  }
}
