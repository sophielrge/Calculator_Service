var http = require('http');
var request = require('sync-request');

const PORT = 80;
const service_ip = '10.10.10.100';

// Calculator microservices
const SUM_SERVICE_IP_PORT = 'http://' + service_ip + ':31001';
const SUB_SERVICE_IP_PORT = 'http://' + service_ip + ':31002';
const MUL_SERVICE_IP_PORT = 'http://' + service_ip + ':31003';
const DIV_SERVICE_IP_PORT = 'http://' + service_ip + ':31004';

// FastAPI metrics endpoint
const METRICS_SERVICE = 'http://10.10.10.230:50060/measures';

// Names for operations
function getOperationName(op) {
    switch (op) {
        case '+': return 'Sum';
        case '-': return 'Subtraction';
        case '*': return 'Multiplication';
        case '/': return 'Division';
        default: return 'Operation';
    }
}

String.prototype.isNumeric = function () {
    return !isNaN(parseFloat(this)) && isFinite(this);
}

Array.prototype.clean = function () {
    for (var i = 0; i < this.length; i++) {
        if (this[i] === "") {
            this.splice(i, 1);
            i--;
        }
    }
    return this;
}

function infixToPostfix(exp) {
    var outputQueue = [];
    var operatorStack = [];
    var operators = {
        "/": { precedence: 3, associativity: "Left" },
        "*": { precedence: 3, associativity: "Left" },
        "+": { precedence: 2, associativity: "Left" },
        "-": { precedence: 2, associativity: "Left" }
    };
    exp = exp.replace(/\s+/g, "");
    exp = exp.split(/([\+\-\*\/\(\)])/).clean();
    for (var i = 0; i < exp.length; i++) {
        var token = exp[i];
        if (token.isNumeric())
            outputQueue.push(token);
        else if ("*/+-".indexOf(token) !== -1) {
            var o1 = token;
            var o2 = operatorStack[operatorStack.length - 1];
            while ("*/+-".indexOf(o2) !== -1 &&
                ((operators[o1].associativity === "Left" && operators[o1].precedence <= operators[o2].precedence) ||
                    (operators[o1].associativity === "Right" && operators[o1].precedence < operators[o2].precedence))) {
                outputQueue.push(operatorStack.pop());
                o2 = operatorStack[operatorStack.length - 1];
            }
            operatorStack.push(o1);
        }
        else if (token === "(")
            operatorStack.push(token);
        else if (token === ")") {
            while (operatorStack[operatorStack.length - 1] !== "(")
                outputQueue.push(operatorStack.pop());
            operatorStack.pop();
        }
    }
    while (operatorStack.length > 0)
        outputQueue.push(operatorStack.pop());
    return outputQueue;
}

// Perform remote microservice operation + measure duration
function doOperation(a, b, operator) {
    var reqBody = a + " " + b;
    var service_host;
    switch (operator) {
        case "+": service_host = SUM_SERVICE_IP_PORT; break;
        case "-": service_host = SUB_SERVICE_IP_PORT; break;
        case "*": service_host = MUL_SERVICE_IP_PORT; break;
        case "/": service_host = DIV_SERVICE_IP_PORT; break;
    }

    const start = process.hrtime.bigint();
    var resp = request('POST', service_host, { body: reqBody });
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;

    var res = parseFloat(resp.getBody());

    return {
        result: res,
        durationMs: durationMs,
        operator: operator,
        a: a,
        b: b,
        name: getOperationName(operator)
    };
}

// Evaluate postfix expression + compute timings
function evaluatePostfix(tokens) {
    var stack = [];
    var timings = [];
    tokens.forEach(function (tk) {
        switch (tk) {
            case "+":
            case "-":
            case "*":
            case "/":
                var y = parseFloat(stack.pop());
                var x = parseFloat(stack.pop());
                var opRes = doOperation(x, y, tk);
                stack.push(opRes.result);
                timings.push(opRes);
                break;
            default:
                stack.push(tk);
                break;
        }
    });

    var result = stack.pop();
    var totalDurationMs = timings.reduce((sum, op) => sum + op.durationMs, 0);

    return {
        result: result,
        timings: timings,
        totalDurationMs: totalDurationMs
    };
}

// Send metrics to FastAPI
function sendMeasuresToFastAPI(expression, evalRes) {
    var payload = {
        expression: expression,
        result: evalRes.result,
        totalDurationMs: evalRes.totalDurationMs,
        operations: evalRes.timings
    };

    try {
        request('POST', METRICS_SERVICE, {
            json: payload,
            timeout: 2000
        });
    } catch (e) {
        console.error("Failed to send measures to FastAPI:", e.message);
    }
}

// HTTP server
console.log("Listening on port : " + PORT);
http.createServer(function (req, resp) {
    let body = [];
    req.on('data', (chunk) => {
        body.push(chunk);
    })
        .on('end', () => {
            body = Buffer.concat(body).toString();

            resp.writeHead(200, { 'Content-Type': 'text/plain' });
            if (body.length != 0) {
                let tks = infixToPostfix(body);
                let evalRes = evaluatePostfix(tks);
                let res = evalRes.result;
                let timings = evalRes.timings;

                console.log("New request : ");
                console.log(body + " = " + res);

                timings.forEach((op) => {
                    console.log(
                        `${op.name}: ${op.a} ${op.operator} ${op.b} = ${op.result} (${op.durationMs.toFixed(3)} ms)`
                    );
                });

                console.log("\r\n");

                sendMeasuresToFastAPI(body, evalRes);

                resp.write("result = " + res + "\r\n");
                resp.write("operations timings:\r\n");
                timings.forEach((op) => {
                    resp.write(
                        `${op.name}: ${op.a} ${op.operator} ${op.b} = ${op.result} (${op.durationMs.toFixed(3)} ms)\r\n`
                    );
                });
            }
            resp.end();
        });

}).listen(PORT);
