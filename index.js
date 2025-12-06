const express = require('express')
const cors = require('cors');
const app = express();
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const port = process.env.PORT || 3000

// middleware 
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.v0yodsg.mongodb.net/?appName=Cluster0`;


app.get('/', (req, res) => {
  res.send('Hello World!')
})

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {
    
    const db = client.db('contest_hub_db');
    const contestsCollection = db.collection('contests')

    // creator related contest apis 

    app.get('/contests/all', async(req, res) => {
      const cursor = contestsCollection.find().sort({'count': -1});
        const result = await cursor.toArray();
        res.send(result);
    })
    app.get('/contests', async(req, res) => {
        const cursor = contestsCollection.find().sort({'count': -1}).limit(6);
        const result = await cursor.toArray();
        res.send(result);
    })

    app.post('/contest', async (req, res) => {
        const contestData = req.body;
        contestData.status = 'pending';
        const result = await contestsCollection.insertOne(contestData);
        res.send(result); 
    })
    


    
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    
   
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
