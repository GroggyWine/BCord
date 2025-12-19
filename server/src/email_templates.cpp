#include "email_templates.h"
#include <fstream>
#include <sstream>
#include <stdexcept>

std::string load_email_template(const std::string &name) {
    std::string path = "/srv/bcord/server/templates/" + name + ".html";
    std::ifstream in(path);
    if (!in) {
        throw std::runtime_error("failed to open template: " + path);
    }
    std::ostringstream ss;
    ss << in.rdbuf();
    return ss.str();
}

std::string render_email_template(std::string tpl,
                                  const std::map<std::string, std::string> &vars) {
    for (const auto &kv : vars) {
        std::string needle = "{{" + kv.first + "}}";
        std::string::size_type pos = 0;
        while ((pos = tpl.find(needle, pos)) != std::string::npos) {
            tpl.replace(pos, needle.size(), kv.second);
            pos += kv.second.size();
        }
    }
    return tpl;
}

