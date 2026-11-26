# Sending website leads to the MoEVing CRM

For whoever runs the website chatbot, contact form, or an automation tool
(Zapier, Make, n8n). Each enquiry you send appears on the CRM's **Leads**
screen within seconds, and the sales admins get a phone notification.

## 1. What you need from MoEVing

An admin makes these in the CRM under **Admin → Website leads → New key**:

- **The address:** `https://good-deal-crm.vercel.app/api/leads/inbound`
- **A key** that starts with `gdl_`. It works like a password.

**Keep the key on a server.** Put it in the chatbot platform's settings or
your backend's environment, never in the website's HTML or JavaScript. Anyone
who has the key can add leads. If it leaks, MoEVing revokes it and makes a new
one.

## 2. Send one request per lead

```
POST https://good-deal-crm.vercel.app/api/leads/inbound
Authorization: Bearer gdl_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json

{
  "name": "Ravi Kumar",
  "company": "Ksherera Dairy",
  "phone": "+91 98450 12345",
  "email": "ravi@ksherera.in",
  "city": "Bangalore",
  "vehicles": 5,
  "vehicle_type": "3W",
  "goods": "Dairy",
  "message": "Need 5 EVs for milk runs from January"
}
```

You can send the key in any one of three ways:

| How | Use when |
|---|---|
| `Authorization: Bearer <key>` header | Your tool can set headers (preferred) |
| `X-API-Key: <key>` header | Your tool has a single "API key header" box |
| `?key=<key>` on the address | Your tool only accepts a URL ("webhook URL"). The admin screen shows this address with the key built in |

The body can be **JSON**, or **form fields**
(`application/x-www-form-urlencoded` or `multipart/form-data`). Fields can be
at the top level or wrapped one level down under `data`, `lead`, `contact`,
`fields` or `payload`.

Test the connection with a `GET` to the same address with the key. A good key
returns `200`.

## 3. Fields

Only a **phone number or an email** is required. Send anything else the
chatbot collected. Names are matched ignoring case, spaces, `-` and `_`, so
`Mobile Number`, `mobile_number` and `mobileNumber` all work.

| CRM field | Accepted names |
|---|---|
| Phone | `phone`, `mobile`, `phone_number`, `mobile_number`, `mobile_no`, `contact_number`, `whatsapp`, `tel`, `telephone` |
| Email | `email`, `email_address`, `email_id`, `mail` |
| Person's name | `name`, `full_name`, `contact_name`, `your_name`, `customer_name`, or `first_name` + `last_name` |
| Company | `company`, `company_name`, `organization`, `organisation`, `business`, `firm` |
| City | `city`, `location`, `town` |
| Number of vehicles | `vehicles`, `vehicle_count`, `number_of_vehicles`, `fleet_size`, `quantity`, `qty`. The first number in the text is used, so "about 12 trucks" becomes 12 |
| Vehicle type | `vehicle_type`, `vehicle`, `vehicle_category` (free text: "3W", "4W", "Tata Ace") |
| Goods carried | `goods`, `type_of_goods`, `cargo`, `industry`, `product` |
| Designation | `designation`, `title`, `job_title`, `role`, `position` |
| Where they found MoEVing | `source`, `found_on`, `how_did_you_hear`, `utm_source`, `lead_source`. Defaults to "Website chatbot" |
| Message / chat summary | `message`, `notes`, `comments`, `requirement`, `query`, `enquiry`, `details`, `conversation`, `transcript`, `summary` (up to 2,000 characters) |
| Enquiry date | `date`, `enquiry_date`, `submitted_at`, `timestamp` (`YYYY-MM-DD…`). Defaults to today in India |

Other fields are ignored. Text longer than the CRM keeps is shortened rather
than refused. If there is no company, the person's name is used.

## 4. Replies

| Status | Meaning | Body |
|---|---|---|
| `201` | Lead created | `{"ok": true, "id": "L-0043"}` |
| `200` | Same phone or email already sent in the last 30 minutes. Nothing was added, so it is safe to retry | `{"ok": true, "duplicate": true, "id": "L-0043"}` |
| `400` | The body was not JSON or form fields | `{"ok": false, "error": "…"}` |
| `401` | Missing, wrong or revoked key | `{"ok": false, "error": "…"}` |
| `413` | Body over 64 KB | `{"ok": false, "error": "…"}` |
| `422` | No phone and no email | `{"ok": false, "error": "…"}` |

Retry only on network errors or a `5xx`. Do not retry `4xx`; fix the request
instead.

## 5. Try it

```bash
curl -X POST https://good-deal-crm.vercel.app/api/leads/inbound \
  -H "Authorization: Bearer gdl_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Lead","phone":"9000000000","message":"Test from the website team - please ignore"}'
```

The lead appears on the CRM's Leads screen with a blue **Website** tag. Ask
MoEVing to mark test leads Not qualified.
