import test from 'node:test';
import assert from 'node:assert/strict';
import {createGamingClient420, GAMING_GAME_IDS, GAMING_SDK_COMPAT_VERSION, validateEntitlement420, validateRewardClaim420, createOfflineGamingAdapter420, createGameConnection420} from '../vendor/420-gaming-sdk/src/index.js';
import {SMOKE_CHROME_GAME_ID as GAME_ID, evaluateSmokeChromeAccess as access, SmokeChromeFeature as Feature} from '../src/access.js';

test('MIG-3 pinned SDK and canonical registration identity', () => {
 assert.equal(GAMING_SDK_COMPAT_VERSION,'0.1.0');
 assert.equal(GAME_ID,GAMING_GAME_IDS.smokeAndChrome);
 const client=createGamingClient420({gameId:GAME_ID});
 assert.equal(client.gameId,GAME_ID);
});
test('MIG-3 guest, registered and wallet boundaries fail closed', () => {
 const guest={registered:false,walletLinked:false,walletConnected:false};
 assert.equal(access({feature:Feature.CORE_MATCH,...guest}).allowed,true);
 assert.equal(access({feature:Feature.CLOUD_SAVE,...guest}).prompt,'register');
 assert.equal(access({feature:Feature.CLOUD_SAVE,registered:true,walletLinked:false,walletConnected:false}).allowed,true);
 assert.equal(access({feature:Feature.OWNED_EDITION,registered:true,walletLinked:false,walletConnected:false}).prompt,'link-wallet');
 assert.equal(access({feature:Feature.OWNED_EDITION,registered:true,walletLinked:true,walletConnected:false}).prompt,'connect-wallet');
 assert.equal(access({feature:Feature.OWNED_EDITION,registered:true,walletLinked:true,walletConnected:true}).allowed,true);
 assert.throws(()=>access({feature:'unauthorized',...guest}),TypeError);
});
test('MIG-3 game-scoped entitlement reads reject foreign provider data',async()=>{
 const foreign={gameId:'420/GAMING/GAME/FOREIGN/V1',profileId:'p',entitlementId:'e',entitlementType:'t',contentId:'c',active:true};
 const seen=[];
 const adapters=Object.fromEntries(['getProfile','ensureProfile','getEntitlement','prepareMigration','getMigrationClaim','getSessionStatus','verifyAttestation'].map(name=>[name,async input=>{seen.push(input.gameId);return name==='getEntitlement'?foreign:input}]));
 const client=createGamingClient420({gameId:GAME_ID,adapters});
 assert.equal(await client.getEntitlement({profileId:'p',entitlementId:'e'}),null);
 assert.deepEqual(seen,[GAME_ID]);
 assert.throws(()=>validateEntitlement420(foreign,GAME_ID),TypeError);
});
test('MIG-3 reward evidence validation and idempotent provider mock',async()=>{
 const claim={gameId:GAME_ID,profileId:'p',claimId:'claim-1',evidenceHash:'0x'+'a'.repeat(64),network:'testnet'};
 validateRewardClaim420(claim,GAME_ID);
 assert.throws(()=>validateRewardClaim420({...claim,evidenceHash:'invalid'},GAME_ID),TypeError);
 assert.throws(()=>validateRewardClaim420({...claim,gameId:'foreign'},GAME_ID),TypeError);
 const ledger=new Set();
 const adapter=createOfflineGamingAdapter420({gameId:GAME_ID});
 const pending=createGameConnection420({gameId:GAME_ID,adapter});
 assert.equal((await pending.submitRewardClaim(claim)).status,'unavailable');
 const provider={gameId:GAME_ID,async connect(){return {status:'connected'}},async entitlement(){return null},async claim(v){validateRewardClaim420(v,GAME_ID);const k=v.gameId+':'+v.profileId+':'+v.claimId;if(ledger.has(k))return {status:'duplicate'};ledger.add(k);return {status:'accepted'};}};
 const linked=createGameConnection420({gameId:GAME_ID,adapter:provider});
 assert.equal(await linked.connect(),'connected');
 assert.equal((await linked.submitRewardClaim(claim)).status,'accepted');
 assert.equal((await linked.submitRewardClaim(claim)).status,'duplicate');
 assert.equal(ledger.size,1);
});
test('MIG-3 offline fallback does not grant wallet entitlements or rewards',async()=>{
 const offline=createOfflineGamingAdapter420({gameId:GAME_ID});
 const conn=createGameConnection420({gameId:GAME_ID,adapter:offline});
 assert.equal(await conn.connect(),'guest');
 assert.equal(await conn.getEntitlement({profileId:'p',entitlementId:'e'}),null);
 assert.equal((await conn.submitRewardClaim({gameId:GAME_ID,profileId:'p',claimId:'r',evidenceHash:'0x'+'b'.repeat(64),network:'testnet'})).status,'unavailable');
 assert.equal(await conn.disconnect(),'disconnected');
});
