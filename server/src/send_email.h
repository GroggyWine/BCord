#ifndef SEND_EMAIL_H
#define SEND_EMAIL_H

#include <string>

// Send an email via the bcord-smtp container
// Returns true if email was accepted by SMTP server
bool send_email(const std::string &to, const std::string &subject, const std::string &body);

#endif // SEND_EMAIL_H
