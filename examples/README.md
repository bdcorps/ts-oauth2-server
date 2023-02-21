# TypeScript OAuth2.0 Server

create a new user:
<img width="1041" alt="CleanShot 2023-02-20 at 15 41 03@2x" src="https://user-images.githubusercontent.com/6132555/220195455-2016083b-ad88-4cd7-8064-ee6cb4acbb07.png">

create a new client:
<img width="1463" alt="CleanShot 2023-02-20 at 15 41 14@2x" src="https://user-images.githubusercontent.com/6132555/220195476-80caad95-29da-4818-8258-1d256ef4fa72.png">

auth request to get code:

````
curl --request GET 'http://localhost:3000/authorize?response_type=code&client_id=b1a639b9-09b6-427c-a6c5-55f10746949c&redirect_uri=https://dashboard.stripe.com/test/apps-oauth/com.saasbase.reetailapp&state=4ca8ea35-80c8-46f1-8d09-a7e32dca2ae4&code_challenge=Pl8QFj5uJy9mUzBu_lWsUrlBo_nuKUllSDMJefwmy00&code_challenge_method=S256' \
--header 'Content-Type: application/x-www-form-urlencoded' \
--data-urlencode 'grant_type=authorization_code' \
--data-urlencode 'client_id=b1a639b9-09b6-427c-a6c5-55f10746949c' \
--data-urlencode 'client_secret=secret' \
--data-urlencode 'redirect_uri=https://dashboard.stripe.com/test/apps-oauth/com.saasbase.reetailapp' \
--data-urlencode 'code_verifier=YTgzNGViY2QtMWYzNS00YWViLTgyMjItYWQ3NzAwOGNmNTU4' \
--data-urlencode 'code=eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnRfaWQiOiJiMWE2MzliO…U2In0.8S38Q8WUHgJorFIrqmxG7nFlq7ekrXLbmNHyvvlUOa4'```
````

To follow add --location to the curl request

token request:

```
curl --location --request POST 'http://localhost:3000/token' \
--header 'Content-Type: application/x-www-form-urlencoded' \
--data-urlencode 'grant_type=authorization_code' \
--data-urlencode 'client_id=b1a639b9-09b6-427c-a6c5-55f10746949c' \
--data-urlencode 'client_secret=secret' \
--data-urlencode 'redirect_uri=https://dashboard.stripe.com/test/apps-oauth/com.saasbase.reetailapp' \
--data-urlencode 'code_verifier=ZTgwMDhlZGYtZTI0NC00M2Y5LTg1NzQtMjRlOGRiYTFiNzBk' \
--data-urlencode 'code=eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnRfaWQiOiJiMWE2MzliOS0wOWI2LTQyN2MtYTZjNS01NWYxMDc0Njk0OWMiLCJyZWRpcmVjdF91cmkiOiJodHRwczovL2Rhc2hib2FyZC5zdHJpcGUuY29tL3Rlc3QvYXBwcy1vYXV0aC9jb20uc2Fhc2Jhc2UucmVldGFpbGFwcCIsImF1dGhfY29kZV9pZCI6ImExMzNhMDUyNzkwZGI1YWU4Zjg4NGFiMTc4NGViOGEzNDlkZTI5NTA2MWY1ZDRlOGMyMDI1NjU4YWI4MmFkYWEzMGE3MGQ5OTVhMWY2OTliMTE5MWZkZThlNzQ1N2ZkZTBiYWU0YmQ5YmU2MmUwZTk0YWFiNjZkYjIwMTc5ZjFjZmJhNWIyODdjNDg4MGRlZDE4ZGRkZDdhMjJkZTNkNWY2OTQ4ZGZkOGVmYTE2YTlhZmQyNmU4YWVjNzQzMzBkNjJmMmU1NDg2NDE2NzEwYzgyMWNjYmEyNzVmMjFhZmM0OTE2OGY2YzU5Mzg3MjdlY2QxMTY3ZDA5YjdmYzUzYTA2ZWI5OTYzODYyNmRiNjAyN2FjYjM5ZTE0OWIzMjQxYTJkNTgxN2JlMTQzZGZhMzA3YTBmYzlkM2VmM2M0ZTUyIiwic2NvcGVzIjpbXSwidXNlcl9pZCI6IjIwMDM0MDRhLWU2NGItNGUyNC1hZTg1LTA5MDg4NDUzZGZhNiIsImV4cGlyZV90aW1lIjoxNjc2OTE5NTIyLCJjb2RlX2NoYWxsZW5nZSI6ImxERFlSdl9Ia1lFcVFxTjNYZ2lTenhZQXQwTGZUdUlyeS1vQS1qemJHbkEiLCJjb2RlX2NoYWxsZW5nZV9tZXRob2QiOiJTMjU2In0.VmRqevOgqfyhTU9pb-DygWLbqGQEyUaZcSS1JdAxPrg'
```
