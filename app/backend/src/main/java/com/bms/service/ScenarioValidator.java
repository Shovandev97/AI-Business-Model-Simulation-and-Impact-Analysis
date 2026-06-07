package com.bms.service;

import com.bms.util.ApiException;
import com.bms.util.Json;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class ScenarioValidator {
  public Map<String, Object> validate(Map<String, Object> input) {
    Map<String, Object> out = new LinkedHashMap<>();
    List<String> errors = new ArrayList<>();
    text(input, out, errors, "name", 3, 120, true, null);
    text(input, out, errors, "description", 0, 10000, false, "");
    text(input, out, errors, "businessModelType", 2, 80, true, null);
    text(input, out, errors, "industry", 2, 80, true, null);
    text(input, out, errors, "customerSegment", 2, 80, true, null);
    text(input, out, errors, "region", 2, 80, true, null);
    text(input, out, errors, "pricingType", 2, 80, true, null);
    integer(input, out, errors, "contractTerm", 1, 120);
    text(input, out, errors, "billingFrequency", 2, 80, true, null);
    text(input, out, errors, "fundingModel", 2, 80, true, null);
    text(input, out, errors, "bundleType", 2, 120, true, null);
    integer(input, out, errors, "transactionVolume", 1, 50000000);
    number(input, out, errors, "expectedRevenue", 1000, 1000000000);
    compliance(input, out, errors);
    integer(input, out, errors, "integrationCount", 0, 100);
    integer(input, out, errors, "processComplexity", 1, 10);
    if (!errors.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "REQUEST_ERROR", String.join("; ", errors));
    return out;
  }

  private void text(Map<String, Object> in, Map<String, Object> out, List<String> errors, String key, int min, int max, boolean required, String fallback) {
    Object raw = in.get(key);
    String value = raw == null ? "" : String.valueOf(raw).trim();
    if (value.isEmpty() && !required) {
      out.put(key, fallback);
      return;
    }
    if (value.length() < min || value.length() > max) errors.add("\"" + key + "\" length must be between " + min + " and " + max + " characters long");
    out.put(key, value);
  }

  private void integer(Map<String, Object> in, Map<String, Object> out, List<String> errors, String key, int min, int max) {
    double value = Json.num(in.get(key));
    if (value % 1 != 0 || value < min || value > max) errors.add("\"" + key + "\" must be an integer between " + min + " and " + max);
    out.put(key, (int) value);
  }

  private void number(Map<String, Object> in, Map<String, Object> out, List<String> errors, String key, double min, double max) {
    double value = Json.num(in.get(key));
    if (value < min || value > max) errors.add("\"" + key + "\" must be between " + min + " and " + max);
    out.put(key, value % 1 == 0 ? (long) value : value);
  }

  private void compliance(Map<String, Object> in, Map<String, Object> out, List<String> errors) {
    List<String> regions = Json.array(in.get("complianceRegions")).stream().map(Json::str).map(String::trim).filter(s -> !s.isEmpty()).toList();
    if (regions.size() < 1 || regions.size() > 8) errors.add("\"complianceRegions\" must contain between 1 and 8 items");
    if (regions.stream().anyMatch(item -> item.length() < 2 || item.length() > 30)) errors.add("\"complianceRegions\" item length must be between 2 and 30 characters long");
    out.put("complianceRegions", regions);
  }
}
