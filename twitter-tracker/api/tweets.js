export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { usernames } = req.query;
    
    if (!usernames) {
      return res.status(400).json({ error: 'usernames parameter required' });
    }

    const BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN;
    
    if (!BEARER_TOKEN) {
      return res.status(500).json({ error: 'Twitter API token not configured' });
    }

    const usernameList = usernames.split(',').map(u => u.trim());
    const allTweets = [];

    // Helper function for Twitter API requests
    async function twitterApiRequest(url) {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Twitter API error: ${response.status}`);
      }

      return await response.json();
    }

    // Get user ID by username
    async function getUserId(username) {
      const url = `https://api.twitter.com/2/users/by/username/${username}`;
      const data = await twitterApiRequest(url);
      return data.data?.id;
    }

    // Get user's tweets
    async function getUserTweets(userId, maxResults = 5) {
      const url = `https://api.twitter.com/2/users/${userId}/tweets?max_results=${maxResults}&tweet.fields=created_at,author_id,public_metrics&expansions=author_id&user.fields=profile_image_url,username`;
      return await twitterApiRequest(url);
    }

    // Process each username
    for (const username of usernameList) {
      try {
        // Get user ID
        const userId = await getUserId(username);
        
        if (!userId) {
          console.log(`User not found: ${username}`);
          continue;
        }

        // Get user's tweets
        const tweetsData = await getUserTweets(userId, 5);
        
        if (tweetsData.data) {
          const userInfo = tweetsData.includes?.users?.[0];
          
          const tweets = tweetsData.data.map(tweet => ({
            id: tweet.id,
            username: username,
            handle: `@${username}`,
            content: tweet.text,
            timestamp: tweet.created_at,
            likes: tweet.public_metrics?.like_count || 0,
            retweets: tweet.public_metrics?.retweet_count || 0,
            comments: tweet.public_metrics?.reply_count || 0,
            avatar: userInfo?.profile_image_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`
          }));
          
          allTweets.push(...tweets);
        }
        
        // Rate limiting - wait between requests
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (userError) {
        console.error(`Error fetching tweets for ${username}:`, userError);
        continue;
      }
    }

    // Sort by timestamp (newest first)
    allTweets.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({ tweets: allTweets });
    
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to fetch tweets' });
  }
}