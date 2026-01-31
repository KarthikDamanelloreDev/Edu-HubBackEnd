const https = require('https');

const domain = 'vegaah.concertosoft.com';
const paths = [
    '/v2/payments/pay-request',
    '/vegaah/v2/payments/pay-request',
    '/CORE/v2/payments/pay-request',
    '/CORE_2.2.2/v2/payments/pay-request',
    '/Vegaah/v2/payments/pay-request'
];

const checkPath = (path) => {
    return new Promise((resolve) => {
        const options = {
            hostname: domain,
            port: 443,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                const isHtml = data.trim().startsWith('<');
                console.log(`Path: ${path} | Status: ${res.statusCode} | IsHTML: ${isHtml}`);
                resolve();
            });
        });

        req.on('error', (e) => {
            console.error(`Path: ${path} | Error: ${e.message}`);
            resolve();
        });

        req.write(JSON.stringify({ test: true }));
        req.end();
    });
};

const run = async () => {
    console.log(`Testing paths on ${domain}...`);
    for (const path of paths) {
        await checkPath(path);
    }
};

run();
