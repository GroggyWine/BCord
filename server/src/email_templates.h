#pragma once
#include <string>
#include <map>

std::string load_email_template(const std::string &name);
std::string render_email_template(std::string tpl,
                                  const std::map<std::string, std::string> &vars);

