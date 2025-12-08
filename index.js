const express = require('express')
const cors = require('cors');
const app = express();
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 3000
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);


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
    const usersCollection = db.collection('users')
    const contestsCollection = db.collection('contests')
    const paymentsCollection = db.collection('payments');
    const submissionsCollection = db.collection('submissions');

    // user related apis 

    app.post('/user', async (req, res) => {
      const userData = req.body;
      const query = {
        email: userData.email
      }
      userData.created_at = new Date().toISOString();
      userData.last_loggedIn = new Date().toISOString();
      userData.role = 'user';

      const alreadyExist = await usersCollection.findOne(query);
      console.log('User already exists--------->', !!alreadyExist);

      if (alreadyExist) {
        console.log('updating user info......');
        const result = await usersCollection.updateOne(query, {
          $set: {
            last_loggedIn: new Date().toISOString(),
          }
        })

        return res.send(result);

      }
      console.log("Save a new user info");
      const result = await usersCollection.insertOne(userData);
      res.send(result);
    })

    app.get('/users', async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    })

    // update user role 
    app.patch('/users/role/:email', async (req, res) => {
      
        const email = req.params.email;
        const { role } = req.body;

        const filter = { email: email };
        const updateDoc = {
          $set: { role: role }
        };

        const result = await usersCollection.updateOne(filter, updateDoc);

        if (result.modifiedCount === 0) {
          return res.status(404).send({ message: "User not found or role already same" });
        }

        res.send({ message: "Role updated successfully", result });

    });


    // creator related contest apis 

    app.get('/contests_all', async (req, res) => {
      const { type } = req.query;

      const filter = type ? { status: 'approved', contestType: type } : { status: 'approved' };
      const cursor = contestsCollection.find(filter).sort({ 'count': -1 });
      const result = await cursor.toArray();
      res.send(result);
    })
    app.get('/contests', async (req, res) => {
      const cursor = contestsCollection.find({status: 'approved'}).sort({ 'count': -1 }).limit(6);
      const result = await cursor.toArray();
      res.send(result);
    })

    app.get('/contest/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await contestsCollection.findOne(query);
      res.send(result);
    })

    app.get('/contests/creator', async(req, res) => {
      const email = req.query.email;
      const query = {email: email};
      const result = await contestsCollection.find(query).toArray();
      res.send(result);

    })

    app.post('/contest', async (req, res) => {
      const contestData = req.body;
      contestData.status = 'pending';
      contestData.created_at= new Date().toISOString();
      const result = await contestsCollection.insertOne(contestData);
      res.send(result);
    })
    app.delete('/contests/:id', async(req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await contestsCollection.deleteOne(query);
      res.send(result)

    })

    app.get("/contests-all", async (req, res) => {
  const contests = await contestsCollection.find().toArray();
  res.send(contests);
});

// Single API for Confirm / Reject / Delete
app.patch("/contests/action/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { action } = req.body; // action = "confirm" | "reject" | "delete"

    if (!["confirm", "reject", "delete"].includes(action)) {
      return res.status(400).send({ error: "Invalid action" });
    }

    if (action === "delete") {
      const result = await contestsCollection.deleteOne({ _id: new ObjectId(id) });
      return res.send({ message: "Contest deleted", result });
    }

    const status = action === "confirm" ? "approved" : "rejected";
    const result = await contestsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status } }
    );

    res.send({ message: `Contest ${status}`, result });
  } catch (error) {
    console.error("Contest Action Error:", error);
    res.status(500).send({ error: error.message });
  }
});


    // payment related apis 


    app.post('/create-checkout-session', async (req, res) => {
      try {
        const paymentInfo = req.body;

        // Validate data
        if (!paymentInfo?.price || Number(paymentInfo.price) < 1) {
          return res.status(400).send({ error: "Invalid price" });
        }
        if (!paymentInfo?.email) {
          return res.status(400).send({ error: "Email is required" });
        }
        if (!paymentInfo?.contestId) {
          return res.status(400).send({ error: "Contest ID is required" });
        }

        // Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],

          line_items: [
            {
              price_data: {
                currency: 'usd',
                unit_amount: Number(paymentInfo.price) * 100, // convert to cents
                product_data: {
                  name: paymentInfo.name,
                  description: paymentInfo.description,
                  images: paymentInfo?.image ? [paymentInfo.image] : [], // safe image
                },
              },
              quantity: 1,
            },
          ],

          mode: 'payment',
          customer_email: paymentInfo.email,

          success_url: `${process.env.CLIENT_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.CLIENT_DOMAIN}/dashboard/contest/${paymentInfo.contestId}`,

          metadata: {
            contestId: paymentInfo.contestId.toString(),
            customer: paymentInfo.email.toString(),
          }
        });

        res.send({ url: session.url });

      } catch (error) {
        console.error("Stripe Checkout Error:", error);
        res.status(500).send({ error: error.message });
      }
    });



    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {


  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
