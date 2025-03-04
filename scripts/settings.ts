import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';

// init twitter httpProxy settings
async function initTwitterHttpProxySettings() {
  const source = process.env.MONGODB_URL ?? "";
  const username = process.env.HTTP_PROXY_USERNAME ?? "";
  const password = process.env.HTTP_PROXY_PASSWORD ?? "";

  // mongodb
  const client = new MongoClient(source, {
    tlsAllowInvalidCertificates: true,
  });
  const collection = client.db("core").collection('coreSettings');

  const docs = await collection.findOne({ category: "httpProxy", "value.product": "datacenterProxies" });
  if (!docs) {
    // read json from file
    const data = fs.readFileSync(path.join(__dirname, 'datacenterProxies.json'), 'utf8');
    const proxies = JSON.parse(data);

    for (const proxy of proxies) {
      await collection.insertOne({
        category: "httpProxy",
        value: {
          product: "datacenterProxies",
          username,
          password,
          // example.com
          entryPoint: proxy.entryPoint,
          // 8001
          port: proxy.port.toString(),
          country: proxy.countryCode,
          assignedIP: proxy.ip,
          httpProxy: `http://${username}:${password}@${proxy.entryPoint}:${proxy.port}`,
          // how many agent using this proxy
          count: 0
        }
      })
    }

    console.log("httpProxy settings successfully added");
  } else {
    console.log("httpProxy settings already exist");
  }
}

// initTwitterHttpProxySettings().then(console.log).catch(console.error);
