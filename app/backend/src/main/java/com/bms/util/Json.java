package com.bms.util;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class Json {
  private Json() {}

  public static Map<String, Object> obj(Object... pairs) {
    Map<String, Object> out = new LinkedHashMap<>();
    for (int i = 0; i < pairs.length; i += 2) out.put(String.valueOf(pairs[i]), pairs[i + 1]);
    return out;
  }

  public static List<Object> list(Object... values) {
    return java.util.Arrays.asList(values);
  }

  @SuppressWarnings("unchecked")
  public static Map<String, Object> map(Object value) {
    return value instanceof Map<?, ?> m ? (Map<String, Object>) m : new LinkedHashMap<>();
  }

  @SuppressWarnings("unchecked")
  public static List<Object> array(Object value) {
    return value instanceof List<?> l ? (List<Object>) l : List.of();
  }

  public static String str(Object value) {
    return value == null ? "" : String.valueOf(value);
  }

  public static double num(Object value) {
    if (value instanceof Number n) return n.doubleValue();
    try {
      return Double.parseDouble(str(value).replace(",", ""));
    } catch (Exception ignored) {
      return 0;
    }
  }

  public static int integer(Object value) {
    return (int) Math.round(num(value));
  }

  public static int clamp(Object value) {
    return clamp(value, 0, 100);
  }

  public static int clamp(Object value, int min, int max) {
    return Math.max(min, Math.min(max, (int) Math.round(num(value))));
  }

  public static double round2(double value) {
    return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).doubleValue();
  }

  public static String id() {
    return UUID.randomUUID().toString().replace("-", "").substring(0, 21);
  }

  public static String labelize(String value) {
    String text = value == null ? "" : value.replaceAll("([A-Z])", " $1").replaceAll("[-_]", " ");
    text = text.replaceAll("\\s+", " ").trim();
    return text.isEmpty() ? text : text.substring(0, 1).toUpperCase() + text.substring(1);
  }

  public static int average(List<Double> values) {
    List<Double> usable = values.stream().filter(Double::isFinite).toList();
    if (usable.isEmpty()) return 0;
    return (int) Math.round(usable.stream().mapToDouble(Double::doubleValue).average().orElse(0));
  }

  public static String stateFromScore(Object score) {
    double value = num(score);
    if (value >= 75) return "Error";
    if (value >= 55) return "Warning";
    return "Success";
  }
}
