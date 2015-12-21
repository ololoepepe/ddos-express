module.exports = function(options) {
    var paths = {};
    var rules = [];
    var createRule = function(rule) {
        rule.users = new Map;
        rule.weight = rule.weight || (options && options.weight) || 1;
        rule.maxWeight = rule.maxWeight || (options && options.maxWeight) || 10;
        rule.errorCode = rule.errorCode || (options && options.errorCode) || 429;
        rule.errorData = (typeof rule.errorData != "undefined") ? rule.errorData
            : ((options && typeof options.errorData != "undefined") ? options.errorData : "Not so fast!");
        rule.queueSize = rule.queueSize || 0;
        rule.use = function(req, res, next) {
            var user = rule.users.get(req.ip);
            if (!user) {
                user = { weight: 0 };
                if (rule.queueSize)
                    user.queue = [];
                rule.users.set(req.ip, user);
            }
            user.weight += rule.weight;
            if (user.weight > rule.maxWeight) {
                if (options && options.logFunction)
                    options.logFunction(req.ip, req.path, user.weight, rule.maxWeight, rule.regexp || rule.string);
                if (user.queue && user.queue.length < rule.queueSize)
                    user.queue.push(next);
                else
                    res.status(rule.errorCode).send(rule.errorData);
                return;
            }
            next();
        };
        rule.check = function() {
            rule.users.forEach(function(user, ip) {
                user.weight -= rule.maxWeight;
                var count = rule.maxWeight - user.weight;
                if (user.queue && user.queue.length > 0 && count > 0) {
                    user.queue.splice(0, count).forEach(function(next) {
                        setTimeout(next, 0);
                    });
                    user.weight += count;
                }
                if (user.weight <= 0)
                    rule.users.delete(ip);
            });
        };
        return rule;
    };
    ((options && options.rules) || [{ regexp: ".*" }]).forEach(function(rule) {
        if (rule.regexp) {
            rule.regexp = new RegExp(rule.regexp, rule.flags);
            rules.push(createRule(rule));
        } else if (rule.string) {
            paths[rule.string] = createRule(rule);
        }
    });
    setInterval(function() {
        for (var path in paths)
            paths[path].check();
        rules.forEach(function(rule) {
            rule.check();
        });
    }, (options && options.checkInterval) || 1000);
    return function(req, res, next) {
        var rule = paths[req.path];
        if (rule)
            return rule.use(req, res, next);
        for (var i = 0; i < rules.length; ++i) {
            rule = rules[i];
            if (req.path.match(rule.regexp))
                return rule.use(req, res, next);
        }
        next();
    };
};
