// ============================================================================
// send_email.cpp — SMTP Email Sender for BCord Backend
// ============================================================================
//
// PURPOSE:
//   This file sends transactional emails (verification, password reset, etc.)
//   from the BCord backend through the local bcord-smtp container.
//
// HOW IT WORKS:
//   1. Backend calls send_email(to, subject, body)
//   2. This code connects to bcord-smtp container on port 25
//   3. bcord-smtp signs the email with DKIM and sends it out
//   4. Recipient receives email from @bekord.com
//
// SMTP SERVER:
//   Container: bcord-smtp (boky/postfix image)
//   Address:   bcord-smtp:25 (Docker internal network)
//   Auth:      NONE REQUIRED (trusted internal network)
//   TLS:       Not needed for internal container-to-container
//
// EMAIL AUTHENTICATION (handled by bcord-smtp):
//   - DKIM: Signs all outgoing mail (selector: mail._domainkey.bekord.com)
//   - SPF:  DNS record authorizes 207.5.208.97 to send for bekord.com
//   - PTR:  Reverse DNS resolves to mail.bekord.com
//
// MODIFIED: 2025-12-19
// REASON:   Original file had placeholder values that never worked.
//           Updated to use the actual bcord-smtp container.
//
// ============================================================================

#include <curl/curl.h>
#include <cstring>   // Needed for memcpy()
#include <string>
#include <iostream>

// ============================================================================
// send_email() - Main function to send an email
// ============================================================================
//
// PARAMETERS:
//   to      - Recipient email address (e.g., "user@gmail.com")
//   subject - Email subject line
//   body    - Email body (plain text)
//
// RETURNS:
//   true  - Email was accepted by SMTP server (doesn't guarantee delivery)
//   false - Failed to connect or SMTP rejected the email
//
// EXAMPLE USAGE:
//   send_email("newuser@gmail.com", "Verify your account", "Click here: ...");
//
// ============================================================================

bool send_email(const std::string &to, const std::string &subject, const std::string &body) {
    
    // ------------------------------------------------------------------------
    // STEP 1: Initialize libcurl
    // ------------------------------------------------------------------------
    // libcurl is a C library for making network requests.
    // We use it here to speak SMTP protocol to our mail server.
    // ------------------------------------------------------------------------
    
    CURL *curl = curl_easy_init();
    if (!curl) {
        std::cerr << "[Email] Failed to init CURL - libcurl not available" << std::endl;
        return false;
    }

    // ------------------------------------------------------------------------
    // STEP 2: Configure the "From" address
    // ------------------------------------------------------------------------
    // This is the sender address that appears in the email.
    // MUST be from bekord.com domain (bcord-smtp only allows this domain).
    // 
    // CHANGED 2025-12-19:
    //   OLD: "no-reply@bcord.run.place"  <- Wrong domain, not authorized
    //   NEW: "no-reply@bekord.com"       <- Correct domain, DKIM signed
    // ------------------------------------------------------------------------
    
    const std::string from = "no-reply@bekord.com";

    // ------------------------------------------------------------------------
    // STEP 3: Build the email message (RFC 5322 format)
    // ------------------------------------------------------------------------
    // Email format requires:
    //   - Headers (To, From, Subject) each ending with \r\n
    //   - Blank line (\r\n) to separate headers from body
    //   - Body text
    //   - Final \r\n
    // ------------------------------------------------------------------------
    
    std::string payload =
        "To: " + to + "\r\n"
        "From: " + from + "\r\n"
        "Subject: " + subject + "\r\n"
        "\r\n" +  // <-- Blank line separates headers from body
        body + "\r\n";

    // ------------------------------------------------------------------------
    // STEP 4: Set up the recipient list
    // ------------------------------------------------------------------------
    // SMTP requires recipients to be specified separately from the message.
    // This is the "envelope" recipient (where mail actually goes).
    // ------------------------------------------------------------------------
    
    struct curl_slist *recipients = nullptr;
    recipients = curl_slist_append(recipients, to.c_str());

    // ------------------------------------------------------------------------
    // STEP 5: Configure SMTP connection
    // ------------------------------------------------------------------------
    //
    // SMTP SERVER: smtp://bcord-smtp:25
    //   - "bcord-smtp" = Docker container name (resolves via Docker DNS)
    //   - Port 25 = Standard SMTP port
    //   - No "smtps://" because we don't need TLS for internal traffic
    //
    // AUTHENTICATION: NONE
    //   - bcord-smtp trusts connections from Docker internal networks
    //   - Configured via RELAY_NETWORKS environment variable
    //   - Networks: 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
    //
    // CHANGED 2025-12-19:
    //   OLD: curl_easy_setopt(curl, CURLOPT_USERNAME, "smtp_user");
    //   OLD: curl_easy_setopt(curl, CURLOPT_PASSWORD, "smtp_password");
    //   OLD: curl_easy_setopt(curl, CURLOPT_URL, "smtp://smtp.yourprovider.com:587");
    //   NEW: No auth needed, using internal bcord-smtp container
    //
    // ------------------------------------------------------------------------
    
    // REMOVED 2025-12-19: Authentication not needed for internal SMTP relay
    // OLD: curl_easy_setopt(curl, CURLOPT_USERNAME, "smtp_user");
    // OLD: curl_easy_setopt(curl, CURLOPT_PASSWORD, "smtp_password");
    
    // SMTP server URL - using Docker internal hostname
    curl_easy_setopt(curl, CURLOPT_URL, "smtp://bcord-smtp:25");

    // ------------------------------------------------------------------------
    // STEP 6: Configure TLS (optional for internal, required for external)
    // ------------------------------------------------------------------------
    //
    // CURLOPT_USE_SSL options:
    //   CURLUSESSL_NONE    - Never use TLS (fine for internal Docker network)
    //   CURLUSESSL_TRY     - Try TLS, fall back to plain if unavailable
    //   CURLUSESSL_ALL     - Require TLS (use for external SMTP servers)
    //
    // For internal container-to-container traffic, TLS is unnecessary.
    // The traffic never leaves the Docker network.
    //
    // CHANGED 2025-12-19:
    //   OLD: CURLUSESSL_ALL  <- Required TLS (would fail on port 25)
    //   NEW: CURLUSESSL_NONE <- No TLS needed for internal Docker network
    //
    // ------------------------------------------------------------------------
    
    // REMOVED 2025-12-19: TLS not needed for internal Docker network
    // OLD: curl_easy_setopt(curl, CURLOPT_USE_SSL, (long)CURLUSESSL_ALL);
    
    // No TLS for internal container communication
    curl_easy_setopt(curl, CURLOPT_USE_SSL, (long)CURLUSESSL_NONE);

    // ------------------------------------------------------------------------
    // STEP 7: Set envelope sender and recipients
    // ------------------------------------------------------------------------
    // MAIL_FROM = Envelope sender (for bounces, separate from "From:" header)
    // MAIL_RCPT = Envelope recipients (where mail is actually delivered)
    // ------------------------------------------------------------------------
    
    curl_easy_setopt(curl, CURLOPT_MAIL_FROM, from.c_str());
    curl_easy_setopt(curl, CURLOPT_MAIL_RCPT, recipients);

    // ------------------------------------------------------------------------
    // STEP 8: Set up the data upload (email content)
    // ------------------------------------------------------------------------
    // SMTP sends email content via a "DATA" command.
    // libcurl needs a callback function to read the email content.
    //
    // The lambda function:
    //   - Gets called by libcurl when it's ready to send data
    //   - Copies chunks of our payload string to libcurl's buffer
    //   - Returns 0 when all data has been sent
    //
    // ------------------------------------------------------------------------
    
    curl_easy_setopt(curl, CURLOPT_READFUNCTION, 
        +[](char *ptr, size_t size, size_t nmemb, void *userp) -> size_t {
            std::string *data = static_cast<std::string *>(userp);
            
            // If no more data, return 0 to signal end
            if (data->empty()) return 0;
            
            // Calculate how much we can copy
            size_t buffer_size = size * nmemb;
            size_t copy_len = std::min(buffer_size, data->size());
            
            // Copy data to libcurl's buffer
            memcpy(ptr, data->c_str(), copy_len);
            
            // Remove the copied portion from our string
            data->erase(0, copy_len);
            
            return copy_len;
        }
    );
    
    // Pointer to our payload string (passed to the callback above)
    curl_easy_setopt(curl, CURLOPT_READDATA, &payload);
    
    // Tell libcurl this is an upload operation
    curl_easy_setopt(curl, CURLOPT_UPLOAD, 1L);

    // ------------------------------------------------------------------------
    // STEP 9: Send the email
    // ------------------------------------------------------------------------
    // curl_easy_perform() does all the work:
    //   1. Connects to bcord-smtp:25
    //   2. Sends EHLO greeting
    //   3. Sends MAIL FROM command
    //   4. Sends RCPT TO command
    //   5. Sends DATA command with email content
    //   6. Sends QUIT
    //
    // Returns CURLE_OK (0) on success, error code otherwise.
    // ------------------------------------------------------------------------
    
    CURLcode res = curl_easy_perform(curl);
    bool success = (res == CURLE_OK);

    // ------------------------------------------------------------------------
    // STEP 10: Handle errors and cleanup
    // ------------------------------------------------------------------------
    
    if (!success) {
        std::cerr << "[Email] CURL error: " << curl_easy_strerror(res) << std::endl;
        std::cerr << "[Email] Failed to send to: " << to << std::endl;
    } else {
        std::cout << "[Email] Successfully sent to: " << to << std::endl;
    }

    // Free the recipient list
    curl_slist_free_all(recipients);
    
    // Cleanup curl handle
    curl_easy_cleanup(curl);
    
    return success;
}

// ============================================================================
// END OF FILE
// ============================================================================
//
// WHAT HAPPENS AFTER THIS CODE SENDS AN EMAIL:
//
//   1. bcord-smtp receives the email from this code
//   2. bcord-smtp adds DKIM signature (signed with bekord.com private key)
//   3. bcord-smtp connects to recipient's mail server (e.g., Gmail MX)
//   4. bcord-smtp delivers the signed email
//   5. Recipient's server verifies:
//      - DKIM signature (checks mail._domainkey.bekord.com DNS)
//      - SPF record (checks if 207.5.208.97 is authorized)
//      - DMARC policy (checks _dmarc.bekord.com)
//   6. If all checks pass, email is delivered to inbox
//
// TROUBLESHOOTING:
//
//   Check if bcord-smtp is running:
//     docker ps | grep bcord-smtp
//
//   Check bcord-smtp logs for delivery status:
//     docker logs bcord-smtp 2>&1 | tail -50
//
//   Test SMTP connectivity from backend:
//     docker exec bcord-backend curl -v smtp://bcord-smtp:25
//
//   Verify DKIM is signing:
//     docker logs bcord-smtp 2>&1 | grep "DKIM-Signature"
//
// ============================================================================
