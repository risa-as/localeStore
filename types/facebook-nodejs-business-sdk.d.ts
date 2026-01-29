declare module 'facebook-nodejs-business-sdk' {
    export class FacebookAdsApi {
        static init(accessToken: string): FacebookAdsApi;
    }

    export class ServerView {
        constructor();
    }

    export class UserData {
        constructor();
        setClientIpAddress(ip: string): UserData;
        setClientUserAgent(agent: string): UserData;
        setFbp(fbp: string): UserData;
        setFbc(fbc: string): UserData;
        setEmail(email: string): UserData;
        setPhone(phone: string): UserData;
        setFirstName(firstName: string): UserData;
        setLastName(lastName: string): UserData;
        setDateOfBirth(dob: string): UserData;
        setCity(city: string): UserData;
        setState(state: string): UserData;
        setZip(zip: string): UserData;
        setCountry(country: string): UserData;
        setExternalId(id: string): UserData;
    }

    export class CustomData {
        constructor();
        setValue(value: number): CustomData;
        setCurrency(currency: string): CustomData;
        setContentIds(ids: string[]): CustomData;
        setContentName(name: string): CustomData
        setContentType(type: string): CustomData;
    }

    export class ServerEvent {
        constructor();
        setEventName(eventName: string): ServerEvent;
        setEventId(eventId: string): ServerEvent;
        setEventTime(time: number): ServerEvent;
        setUserData(userData: UserData): ServerEvent;
        setCustomData(customData: CustomData): ServerEvent;
        setActionSource(source: string): ServerEvent;
        setEventSourceUrl(url: string): ServerEvent;
    }

    export class EventRequest {
        constructor(accessToken: string, pixelId: string);
        setEvents(events: ServerEvent[]): EventRequest;
        execute(): Promise<any>;
    }
}
