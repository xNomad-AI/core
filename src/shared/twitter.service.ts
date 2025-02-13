import { Scraper } from 'agent-twitter-client';
import { sleep } from './utils.service.js';

export async function testTwitterConfig(
  username,
  password,
  email,
  twitter2faSecret,
  content: string,
): Promise<{
  isLogin: boolean;
  isPosted?: boolean;
  message?: string;
}> {
  console.log(
    'testTwitterConfig',
    username,
    password,
    email,
    twitter2faSecret,
    content,
  );
  const result: any = {};
  const scraper = new Scraper();

  // test login
  try {
    if (!username) {
      throw new Error('Username is required');
    }
    if (!password) {
      throw new Error('Password is required');
    }
    if (!email) {
      throw new Error('Email is required');
    }
    await scraper.login(username, password, email, twitter2faSecret);
  } catch (e) {
    return { isLogin: false, message: e.message };
  }

  await sleep(5000);
  try {
    if (await scraper.isLoggedIn()) {
      result.isLogin = true;
    }
  } catch (e) {
    return { isLogin: false, message: 'login failed' };
  }

  // test post
  try {
    if (content) {
      const postResponse = await scraper.sendTweet(content);
      if (postResponse.status === 200) {
        result.isPosted = true;
      } else {
        result.isPosted = false;
        result.message = await postResponse.text();
      }
    }
  } catch (e) {
    result.isPosted = false;
    result.message = e.message;
  }
  return result;
}
