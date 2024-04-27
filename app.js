const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("app.db");
require("dotenv").config();

db.serialize(() => {
  db.run("CREATE TABLE IF NOT EXISTS steamUsers (steamId TEXT, steamName TEXT)");
});

const app = express();
app.use(express.urlencoded({ extended: true }));

const axios = require("axios");

app.get("/", (req, res) => {
  res.send(`
    <form action="/api/add/steamId" method="post">
      <input type="text" name="steamId" placeholder="Steam ID" />
      <input type="text" name="steamVU" placeholder="Steam Vanity URL" />
      <button type="submit">Submit</button>
    </form>
    <a href="/api/inventory">Check inventories</a>
    `);
});

app.post("/api/add/steamId", async (req, res) => {
  let steamId = req.body.steamId;
  const steamVU = req.body.steamVU;
  const steamApiKey = process.env.KEY;

  
  if (!steamId && steamVU) {
    try {
      const { data } = await axios.get(
        `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${steamApiKey}&format=json&vanityurl=${steamVU}`
      );
      steamId = data.response.steamid;
    } catch (error) {
      console.error(error);
      res.send("Error resolving Steam Vanity URL");
    }
  }

  if (!steamId) {
    res.send("Steam ID or Vanity URL is required");
  }
  
  try {
    const { data } = await axios.get(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${steamApiKey}&format=json&steamids=${steamId}`
    );
    const steamName = data.response.players[0].personaname;

    const existingUser = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM steamUsers WHERE steamId = ?", [steamId], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });

    if (existingUser) {
      res.send(`
        Steam ID already exists
        <div>
          <a href="/api/inventory">Check inventories</a>
        </div>
        <div>
          <a href="/">Go back</a>
        </div>
      `);
      return;
    }

    db.run("INSERT INTO steamUsers (steamId, steamName) VALUES (?, ?)",
      [steamId, steamName],
      (err) => {
        if (err) {
          res.send(err);
        } else {
          res.send(`
            Steam ID added successfully
            <div>
              <a href="/api/inventory">Check inventories</a>
            </div>
            <div>
              <a href="/">Go back</a>
            </div>
          `);
        }
    });
  } catch (error) {
    console.error(error);
    res.send(`
      Error adding Steam ID
      <div>
        <a href="/api/inventory">Check inventories</a>
      </div>
      <div>
        <a href="/">Go back</a>
      </div>
    `);
  }
});

app.get("/api/inventory", async (req, res) => {
  const itemId = req.query.itemId ?? "5594397966";

  const itemCounts = {};

  try {
    const rows = await new Promise((resolve, reject) => {
      db.all("SELECT * FROM steamUsers", (err, rows) => {
        if (err) reject(err);
        resolve(rows);
      });
    });


    for (const row of rows) {
      const { data } = await axios.get(
        `https://steamcommunity.com/inventory/${row.steamId}/252490/2?l=english&count=500`
      );
      
      itemCounts[row.steamId] = {
        name: row.steamName.replace(/bandit.camp/gi, "").trim(),
        amount: data["assets"].filter((item) => item.classid === itemId).length
      };
    }

    res.send(`
      <a href="/">Go back</a>
      <h1>Scarecrow Facemasks</h1>
      <pre>${JSON.stringify(itemCounts, null, 2)}</pre>
      <p>total count: ${Object.values(itemCounts).reduce((acc, curr) => acc + curr.amount, 0)}</p>
    `);
  } catch (error) {
    res.send("něco je špatně, zjisti si to sám :D <= (toho smajlíka tam dal github copilot)");
  }
});


app.listen(3000, () => {
  console.log("Server is running on port 3000");
});