
export const namespace = "https://sobamail.com/module/user/identity/v1";

export class AddIdentity {
    static KEY = `{${namespace}}${this.name}`;

    constructor({address = null}) { this.address = address; }

    process() { return soba.data.insert("iden", this); }
}

export class SetAttrIdentity {
    static KEY = `{${namespace}}${this.name}`;

    constructor({address = null, key = null, value = null}) {
        this.address = address;
        this.key = key;
        this.value = value;
    }

    process() { return soba.data.insert("iden_attr", this); }
}

export class RemoveIdentity {
    static KEY = `{${namespace}}${this.name}`;

    constructor({address = null}) { this.address = address; }

    process() {
        const parent = soba.data.find("iden", {address : this.address}).hash;
        soba.data.delete("iden", parent);
    }
}

export class AddRole {
    static KEY = `{${namespace}}${this.name}`;

    constructor({name, domain = null, user = null, uuid = null} = {}) {
        this.name = name;
        this.domain = domain;
        this.user = user;
        this.uuid = uuid;
    }

    process() {
        soba.data.insert("role_own", this);
        soba.log.debug(`Wrote role ${JSON.stringify(this)}`);
    }
}

export class RevokeRole { // FIXME: isn't this dead code??
    static KEY = `{${namespace}}${this.name}`;

    constructor({name, domain = null, user = null, uuid = null} = {}) {
        this.name = name;
        this.domain = domain;
        this.user = user;
        this.uuid = uuid;
    }

    process() {
        const key = {name : this.name, domain : this.domain, user : this.user};
        const parent = soba.data.find("role_own", key).hash;
        soba.data.delete("role_own", parent);
    }
}
