package com.bms.controller;

import com.bms.util.ApiException;
import com.bms.util.Json;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {
  @ExceptionHandler(ApiException.class)
  public ResponseEntity<Object> handleApi(ApiException error) {
    return ResponseEntity.status(error.getStatus()).body(Json.obj(
        "success", false,
        "errorCode", error.getErrorCode() == null ? codeFor(error.getStatus()) : error.getErrorCode(),
        "error", error.getStatus().is5xxServerError() ? "InternalServerError" : "RequestError",
        "message", error.getMessage(),
        "details", error.getDetails()));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<Object> handleGeneric(Exception error) {
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Json.obj(
        "success", false,
        "errorCode", "INTERNAL_SERVER_ERROR",
        "error", "InternalServerError",
        "message", error.getMessage()));
  }

  private String codeFor(HttpStatus status) {
    return status.is5xxServerError() ? "INTERNAL_SERVER_ERROR" : "REQUEST_ERROR";
  }
}
