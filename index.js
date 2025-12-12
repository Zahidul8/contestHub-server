const express = require('express')
const cors = require('cors');
const app = express();
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 3000
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const admin = require("firebase-admin");

const serviceAccount = require("./contesthub-project-666ef-firebase-adminsdk-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


// middleware 
app.use(cors());
app.use(express.json());

const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).send({message: 'unauthorized access'});
    
  }

  try{

    const idToken = token.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    console.log('decoded in the token', decoded.email);
    req.decoded_email = decoded.email;
    

    next();
  } catch(err) {
    return res.status(401).send({message: 'unauthorized access'});
  }
  
}

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


    // middleware of admin and creator  
    const verifyAdmin = async(req,res, next) => {
      const email = req.decoded_email;
      const query = {email};
      const user = await usersCollection.findOne(query);

      if(!user || user.role !== 'admin') {
         return res.status(403).send({ message: 'forbidden access' })
      }

      next();
      
    }
    const verifyCreator = async(req,res, next) => {
      const email = req.decoded_email;
      const query = {email};
      const user = await usersCollection.findOne(query);

      if(!user || user.role !== 'creator') {
         return res.status(403).send({ message: 'forbidden access' })
      }

      next();
      
    }



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

    app.get('/users', verifyFBToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    })

    // update user role 
    app.patch('/users/role/:email', verifyFBToken, verifyAdmin, async (req, res) => {

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
      const cursor = contestsCollection.find({ status: 'approved' }).sort({ 'count': -1 }).limit(6);
      const result = await cursor.toArray();
      res.send(result);
    })

    // get all winners 
    app.get('/recent-winners', async(req, res) => {
      const result = await contestsCollection.find({status: 'approved', winnerName: {$exists: true, $ne: null}}).sort({
declared_at: -1}).limit(3).toArray();
      res.send(result);
    })
    app.get('/total-winners', async(req, res) => {
      const result = await contestsCollection.find({status: 'approved', winnerName: {$exists: true, $ne: null}}).toArray();
      res.send(result);
    })

    app.get('/contest-search', async(req, res) => {
      const searchText = req.query.search;
      const query = {contestType: {$regex: searchText, $options: 'i'}};
      const result = await contestsCollection.find(query).sort({created_at: -1}).toArray();
      res.send(result);
    })

    app.get('/contest/:id',verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await contestsCollection.findOne(query);
      res.send(result);
    })

    app.get('/contests/creator',verifyFBToken, verifyCreator, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await contestsCollection.find(query).toArray();
      res.send(result);

    })

    app.get("/contests-all", verifyFBToken, verifyAdmin, async (req, res) => {
      const contests = await contestsCollection.find().toArray();
      res.send(contests);
    });

    app.get('/contests-winner',verifyFBToken, async (req, res) => {
      const email = req.query.email;
      const query = {winnerEmail: email};
      const result = await contestsCollection.find(query).toArray();
      res.send(result);
    })

    app.post('/contest', verifyFBToken, verifyCreator, async (req, res) => {
      const contestData = req.body;
      contestData.status = 'pending';
      contestData.created_at = new Date().toISOString();
      const result = await contestsCollection.insertOne(contestData);
      res.send(result);
    })

    // UPDATE CONTEST API
    app.patch("/contest/:id", verifyFBToken, verifyCreator, async (req, res) => {
      try {
        const id = req.params.id;
        const {
          name,
          description,
          price,
          prizeMoney,
          taskInstruction,
          contestType,
          deadline,
        } = req.body;

        // Build the update object
        const updateDoc = {
          $set: {
            name,
            description,
            price: Number(price),
            prizeMoney: Number(prizeMoney),
            taskInstruction,
            contestType,
            deadline: new Date(deadline),
            updated_at: new Date().toISOString(),
          },
        };

        // Update the contest
        const result = await contestsCollection.updateOne(
          { _id: new ObjectId(id) },
          updateDoc
        );

        res.send({
          message: "Contest updated successfully",
          modifiedCount: result
        });
      } catch (error) {
        console.error("Update Contest Error:", error);
        res.status(500).send({ error: error.message });
      }
    });




    app.delete('/contests/:id', verifyFBToken, verifyCreator, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await contestsCollection.deleteOne(query);
      res.send(result)

    })

    // Single API for Confirm / Reject / Delete
    app.patch("/contests/action/:id", verifyFBToken, verifyAdmin, async (req, res) => {
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

    app.get('/payment-status', verifyFBToken, async(req,res) => {
      const {email, contestId} = req.query;
      const result = await paymentsCollection.findOne({contestId:contestId, user_email: email});
      res.send(result);
     

    })

    app.get('/payments/participator', verifyFBToken, async(req, res) => {
      const email = req.query.email;
      const query = {user_email: email};
      const result = await paymentsCollection.find(query).toArray();
      res.send(result);
    })

    app.post('/create-checkout-session', verifyFBToken, async (req, res) => {
  try {
    const { contestId, email, price, name, description, image } = req.body;

    // Check if user already paid for this contest
    const existingPayment = await paymentsCollection.findOne({
      contestId: contestId,
      user_email: email,
      paymentStatus: "paid",
    });

    if (existingPayment) {
      return res.status(400).send({
        error: "You have already paid for this contest."
      });
    }

    // Proceed to create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: Number(price) * 100,
            product_data: { name, description, images: image ? [image] : [] },
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: email,
      success_url: `${process.env.CLIENT_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_DOMAIN}/dashboard/payment-cancelled/${contestId}`,
      metadata: {
        contestId,
        user_email: email,
        contestName: name,
      },
    });

    res.send({ url: session.url });

  } catch (error) {
    console.error("Stripe Checkout Error:", error);
    res.status(500).send({ error: error.message });
  }
});

    app.post('/payment-success', verifyFBToken, async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).send({ error: "Session ID is required" });
    }

    // Retrieve session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const paymentExist = await paymentsCollection.findOne({
  contestId: session.metadata.contestId,
  user_email: session.metadata.user_email,
  paymentStatus: "paid"
});

if (paymentExist) {
  return res.send({ message: "Payment already exists", transactionId: session.payment_intent });
}
    // Fetch contest info
    const contest = await contestsCollection.findOne({ _id: new ObjectId(session.metadata.contestId) });
    if (!contest) {
      return res.status(404).send({ error: "Contest not found" });
    }

    // Prepare payment data
    const paymentData = {
      sessionId: session.id,                  // unique
      transactionId: session.payment_intent,
      amount: session.amount_total / 100,
      image: contest.image,
      prizeMoney: contest.prizeMoney,
      deadline: contest.deadline,
      contestType: contest.contestType,
      creatorEmail: contest.email,
      user_email: session.metadata.user_email,
      contestId: session.metadata.contestId,
      contestName: session.metadata.contestName,
      paymentStatus: session.payment_status,
      winnerName: contest.winnerName,
      paidAt: new Date(),
    };

    // Insert payment only if sessionId does not exist
    const result = await paymentsCollection.updateOne(
      { sessionId: session.id },       // search by sessionId
      { $setOnInsert: paymentData },   // insert only if not exists
      { upsert: true }
    );

    // Only increment contest count if this is the first payment
    if (result.upsertedCount === 1) {
      await contestsCollection.updateOne(
        { _id: new ObjectId(session.metadata.contestId) },
        { $inc: { count: 1 } }
      );
    }

    res.send({
      transactionId: session.payment_intent,
      contestId: contest._id,
      message: result.upsertedCount === 1 ? "Payment recorded" : "Payment already exists"
    });

  } catch (error) {
    console.error("Payment Success Error:", error);
    res.status(500).send({ error: error.message });
  }
});


    // submission task related apis 

    app.get('/creator/submission', verifyFBToken, verifyCreator, async (req, res) => {
      const email = req.query.email;
      const result = await submissionsCollection.find({creator_email: email}).sort({created_at: -1}).toArray();
      res.send(result);

    })
    app.get('/submission/:id', verifyFBToken, verifyCreator, async (req , res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await submissionsCollection.findOne(query);
      res.send(result);
    })

    app.post('/submission', verifyFBToken, async(req,res) => {
      const taskInfo = req.body;
      const query = {user_email: taskInfo.user_email, contestId: taskInfo.contestId};
      const existintTask = await submissionsCollection.findOne(query);

      if (existintTask) {
        return res.send({message: 'Task Already added'});
      }
      
      taskInfo.created_at = new Date().toISOString();
      const result = await submissionsCollection.insertOne(taskInfo);
      res.send(result);
    })

    app.patch('/contest/declare-winner/:id', verifyFBToken, verifyCreator, async(req, res) => {
      const {winnerName, winnerEmail, winnerImage} = req.body;
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const existingData = await contestsCollection.findOne(query);
      if (!!existingData.winnerName) {
        return res.send({message: 'You have already declared winner'})
      }
      const updatedDoc = {
        $set: {
          winnerName: winnerName,
          winnerEmail: winnerEmail,
          winnerImage: winnerImage,
          declared_at: new Date().toISOString(),
        }
      }

      const result = await contestsCollection.updateOne(query, updatedDoc);
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
