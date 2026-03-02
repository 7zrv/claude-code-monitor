use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

pub fn now_iso() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

pub fn json_response(code: &str, body: &str) -> Vec<u8> {
    let header = format!(
        "HTTP/1.1 {}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n",
        code,
        body.len()
    );
    [header.as_bytes(), body.as_bytes()].concat()
}

pub fn bytes_response(code: &str, body: &[u8], content_type: &str) -> Vec<u8> {
    let header = format!(
        "HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n",
        code,
        content_type,
        body.len()
    );
    [header.as_bytes(), body].concat()
}

pub fn content_type_for(path: &str) -> &'static str {
    if path.ends_with(".html") {
        "text/html; charset=utf-8"
    } else if path.ends_with(".css") {
        "text/css; charset=utf-8"
    } else if path.ends_with(".js") {
        "application/javascript; charset=utf-8"
    } else if path.ends_with(".json") {
        "application/json; charset=utf-8"
    } else {
        "application/octet-stream"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_now_iso_returns_nonempty_rfc3339() {
        let result = now_iso();
        assert!(!result.is_empty());
        assert!(result.contains('T'));
        assert!(result.ends_with('Z') || result.contains('+'));
    }

    #[test]
    fn test_json_response_format() {
        let resp = json_response("200 OK", r#"{"ok":true}"#);
        let text = String::from_utf8(resp).unwrap();
        assert!(text.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(text.contains("Content-Type: application/json"));
        assert!(text.contains("Content-Length: 11"));
        assert!(text.ends_with(r#"{"ok":true}"#));
    }

    #[test]
    fn test_json_response_404() {
        let resp = json_response("404 Not Found", r#"{"error":"nope"}"#);
        let text = String::from_utf8(resp).unwrap();
        assert!(text.starts_with("HTTP/1.1 404 Not Found\r\n"));
        assert!(text.contains(r#"{"error":"nope"}"#));
    }

    #[test]
    fn test_bytes_response_format() {
        let body = b"hello world";
        let resp = bytes_response("200 OK", body, "text/plain");
        let text = String::from_utf8(resp).unwrap();
        assert!(text.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(text.contains("Content-Type: text/plain"));
        assert!(text.contains("Content-Length: 11"));
        assert!(text.ends_with("hello world"));
    }

    #[test]
    fn test_content_type_for_html() {
        assert_eq!(content_type_for("index.html"), "text/html; charset=utf-8");
    }

    #[test]
    fn test_content_type_for_css() {
        assert_eq!(content_type_for("style.css"), "text/css; charset=utf-8");
    }

    #[test]
    fn test_content_type_for_js() {
        assert_eq!(
            content_type_for("app.js"),
            "application/javascript; charset=utf-8"
        );
    }

    #[test]
    fn test_content_type_for_json() {
        assert_eq!(
            content_type_for("data.json"),
            "application/json; charset=utf-8"
        );
    }

    #[test]
    fn test_content_type_for_unknown() {
        assert_eq!(content_type_for("file.bin"), "application/octet-stream");
        assert_eq!(content_type_for("archive.tar"), "application/octet-stream");
    }
}
