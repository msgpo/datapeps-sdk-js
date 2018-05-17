import * as Config from '../../Config';
import * as DataPeps from '../../../src/DataPeps';
import * as nacl from 'tweetnacl';
import { expect } from 'chai';
import 'mocha';


type TestResource =
    DataPeps.Resource<{ description: string; }>

describe('Resource.list', () => {
    let seed = Math.floor(Math.random() * 99999)

    let aliceSecret = nacl.randomBytes(128)
    let alice: DataPeps.IdentityFields = {
        login: "alice." + seed + "@peps.test",
        name: "alice 1",
        kind: "user",
        payload: new TextEncoder().encode(JSON.stringify({
            test: 1
        })),
    }

    let bobSecret = nacl.randomBytes(128)
    let bob: DataPeps.IdentityFields = {
        login: "bob." + seed + "@peps.test",
        name: "bob 1",
        kind: "user",
        payload: new TextEncoder().encode(JSON.stringify({
            test: 1
        })),
    }

    let charlieSecret = nacl.randomBytes(128)
    let charlie: DataPeps.IdentityFields = {
        login: "charlie." + seed + "@peps.test",
        name: "charlie 1",
        kind: "user",
        payload: new TextEncoder().encode(JSON.stringify({
            test: 1
        })),
    }

    let deviceSecret = nacl.randomBytes(128)
    let device: DataPeps.IdentityFields = {
        login: "device." + seed + "@peps.test",
        name: "device 1",
        kind: "device",
        payload: null,
    }

    let aliceSession: DataPeps.Session
    let bobSession: DataPeps.Session
    let charlieSession: DataPeps.Session
    let deviceSession: DataPeps.Session

    let aliceRes1: TestResource
    let aliceRes2: TestResource
    let bobRes: TestResource
    let sharedRes: TestResource

    before(async () => {
        await Config.init()
        await DataPeps.register(alice, aliceSecret)
        await DataPeps.register(bob, bobSecret)
        await DataPeps.register(charlie, charlieSecret)
        aliceSession = await DataPeps.login(alice.login, aliceSecret)
        bobSession = await DataPeps.login(bob.login, bobSecret)
        charlieSession = await DataPeps.login(charlie.login, charlieSecret)
        await aliceSession.Identity.create(device, { secret: deviceSecret })
        await aliceSession.Identity.extendSharingGroup(alice.login, [device.login])
        deviceSession = await DataPeps.login(device.login, deviceSecret)
        aliceRes1 = await aliceSession.Resource.create("test/A", { description: "This is a test resource for Alice 1" }, [alice.login])
        aliceRes2 = await aliceSession.Resource.create("test/A", { description: "This is a test resource for Alice 2" }, [alice.login])
        bobRes = await bobSession.Resource.create("test/A", { description: "This is a test resource for Bob" }, [bob.login])
    })

    it('Check resources created by alice', async () => {
        let got = await aliceSession.Resource.list<{ description: string }>()
        expect(got).to.be.deep.equal([aliceRes2, aliceRes1])
    })

    it('Check resources created by bob', async () => {
        let got = await bobSession.Resource.list<{ description: string }>()
        expect(got).to.be.deep.equal([bobRes])
    })

    it('Check alice can access to its resources after key renewal', async () => {
        await aliceSession.Identity.renewKeys(aliceSession.login)
        let got = await aliceSession.Resource.list<{ description: string }>()
        expect(got).to.be.deep.equal([aliceRes2, aliceRes1])
    })

    let aliceRes3: TestResource
    it('Check alice can access to a new resource after key renewal', async () => {
        await aliceSession.renewKeys()
        expect(await aliceSession.Resource.get(aliceRes1.id)).to.be.deep.equal(aliceRes1) //TODO: remove when key staling has been fixed for resource creation
        aliceRes3 = await aliceSession.Resource.create("test/A", { description: "This is a test resource for Alice 3" }, [alice.login])

        let got = await aliceSession.Resource.list<{ description: string }>()
        expect(got).to.be.deep.equal([aliceRes3, aliceRes2, aliceRes1])
    })

    it('Check bob can access to a resource shared by alice', async () => {
        sharedRes = await aliceSession.Resource.create("test/A", { description: "resource created by alice shared with bob" }, [alice.login, bob.login])
        let got = await bobSession.Resource.list<{ description: string }>()
        expect(got).to.be.deep.equal([sharedRes, bobRes])
    })

    it('Check charlie can access to a resource created by alice shared by bob', async () => {
        await bobSession.Resource.extendSharingGroup(sharedRes.id, [charlie.login])
        let got = await charlieSession.Resource.list<{ description: string }>()
        expect(got).to.be.deep.equal([sharedRes])
    })

    it('Successfully parse resources with custom function', async () => {
        let contentRes1 = "Hello World!";
        let contentRes2 = "Hello Charlie!";
        let options = {
            serialize: (payload: string) => new TextEncoder().encode(payload)
        }
        await charlieSession.Resource.create<string>("test/A", contentRes1, [charlie.login], options)
        await charlieSession.Resource.create<string>("test/A", contentRes2, [charlie.login], options)
        let got = await charlieSession.Resource.list<string>({
            parse: (bytes: Uint8Array) => {
                try {
                    return new TextDecoder('utf-8').decode(bytes);
                } catch (e) {
                    return '';
                }
            }
        })
        expect(got[1].payload).to.be.equal(contentRes1)
        expect(got[0].payload).to.be.equal(contentRes2)
    })

    it('Check device can list resources by assuming alice identity', async () => {
        let got = await deviceSession.Resource.list<{ description: string }>({ assume: alice.login })
        expect(got).to.be.deep.equal([sharedRes, aliceRes3, aliceRes2, aliceRes1])
    })

    it('Check offset and limit', async () => {
        let got = await aliceSession.Resource.list<{ description: string }>({ limit: 10 })
        expect(got).to.be.deep.equal([sharedRes, aliceRes3, aliceRes2, aliceRes1])

        got = await aliceSession.Resource.list<{ description: string }>({ limit: 2 })
        expect(got).to.be.deep.equal([sharedRes, aliceRes3])

        got = await aliceSession.Resource.list<{ description: string }>({ limit: 2, offset: 1 })
        expect(got).to.be.deep.equal([aliceRes3, aliceRes2])

        got = await aliceSession.Resource.list<{ description: string }>({ limit: 2, offset: 5 })
        expect(got).to.be.deep.equal([])
    })
})
