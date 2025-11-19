var http = require ('http');
var request = require('sync-request');

const PORT = 80;
const service_ip = '10.10.10.100';


const SUM_SERVICE_IP_PORT = 'http://'+service_ip+':31001';
const SUB_SERVICE_IP_PORT = 'http://'+service_ip+':31002';
const MUL_SERVICE_IP_PORT = 'http://'+service_ip+':31003';
const DIV_SERVICE_IP_PORT = 'http://'+service_ip+':31004';



String.prototype.isNumeric = function() {
    return !isNaN(parseFloat(this)) && isFinite(this);
}
Array.prototype.clean = function() {
    for(var i = 0; i < this.length; i++) {
        if(this[i] === "") {
            this.splice(i, 1);
        }
    }
    return this;
}		
function infixToPostfix(exp) {
	var outputQueue = [];
	var operatorStack = [];
	var operators = {"/": { precedence: 3, associativity: "Left" },
					 "*": { precedence: 3, associativity: "Left" },
					 "+": { precedence: 2, associativity: "Left" },
					 "-": { precedence: 2, associativity: "Left" }}
	exp = exp.replace(/\s+/g, "");
	exp = exp.split(/([\+\-\*\/\(\)])/).clean();
	for(var i = 0; i < exp.length; i++) {
		var token = exp[i];
		if(token.isNumeric())
			outputQueue.push(token);
		else 
			if("*/+-".indexOf(token) !== -1) {
				var o1 = token;
				var o2 = operatorStack[operatorStack.length - 1];
				while("*/+-".indexOf(o2) !== -1 && ((operators[o1].associativity === "Left" && operators[o1].precedence <= operators[o2].precedence) || (operators[o1].associativity === "Right" && operators[o1].precedence < operators[o2].precedence))){
					outputQueue.push(operatorStack.pop());
					o2 = operatorStack[operatorStack.length - 1];
				}
				operatorStack.push(o1);
			}
			else 
				if(token === "(")
					operatorStack.push(token);
				else
					if(token === ")") {
						while(operatorStack[operatorStack.length - 1] !== "(")
							outputQueue.push(operatorStack.pop());
						operatorStack.pop();
					}
	}
	while(operatorStack.length > 0)
		outputQueue.push(operatorStack.pop());
	return outputQueue;
}
/*function doOperation(a, b, operator) {
	var res= NaN;
	switch (operator) {
		case "*": res = a * b; break;
		case "/": res = a / b; break;
		case "+": res = a + b; break;
		case "-": res = a - b; break;
	}
	return res;
}*/
function doOperation(a, b, operator) {
	var reqBody = a + " " + b;
	var service_host;
	switch (operator) {
		case "+": service_host= SUM_SERVICE_IP_PORT; break;
		case "-": service_host= SUB_SERVICE_IP_PORT; break;
		case "*": service_host= MUL_SERVICE_IP_PORT; break;
		case "/": service_host= DIV_SERVICE_IP_PORT; break;
	}
	var resp = request('POST', service_host, {body: reqBody});
	var res = resp.getBody();
	return res;
}
function evaluatePostfix(tokens) {
	var stack = [];
	tokens.forEach(
		function(tk) {
			switch (tk) {
				case "*":
				case "/":
				case "+":
				case "-":
					var y = parseFloat(stack.pop());
					var x = parseFloat(stack.pop());
					var z = doOperation(x, y, tk);
					stack.push(z);
				break;
	
				default:
					stack.push(tk);
				break;
			}
		}
	);
	return stack.pop();
}


console.log("Listening on port : " + PORT);
http.createServer (function(req, resp) {
	let body = [];
	req.on('data', (chunk) => { 
			body.push(chunk);
		})
	   .on('end', () => { 
			body = Buffer.concat(body).toString(); 
			
			resp.writeHead(200, {'Content-Type': 'text/plain'});
			if (body.length != 0) {
				let tks = infixToPostfix(body);
				let res = evaluatePostfix(tks);
				console.log("New request : ");
				console.log(body + " = " + res);
				console.log("\r\n");
				resp.write("result = " + res);
				resp.write("\r\n");
			}
			resp.end();
	   });

}).listen(PORT);



