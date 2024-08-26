const express = require('express');
const bodyParser = require('body-parser');
const { Builder, By, until, Key } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
//npm install express body-parser selenium-webdriver

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Function to simulate typing with delays
async function slowType(element, text, delay = 2000) {
    for (let char of text) {
        await element.sendKeys(char);
        await new Promise(resolve => setTimeout(resolve, delay));
    }
}

// Function to handle pop-ups like "Turn on Notifications"
async function dismissPopups(driver) {
    try {
        let popup = await driver.findElement(By.xpath("//button[text()='Not Now']"));
        if (popup) {
            await popup.click();
            await driver.sleep(1000); // Short delay after closing popup
        }
    } catch (err) {
        console.log('No popup detected.');
    }
}

// Function to dismiss any pop-ups in the message area
async function dismissMessagePopups(driver) {
    try {
        let messagePopup = await driver.findElement(By.xpath("//button[text()='Not Now']"));
        if (messagePopup) {
            await messagePopup.click();
            await driver.sleep(1000); // Short delay after closing popup
        }
    } catch (err) {
        console.log('No message popup detected.');
    }
}

// Function to send a message without splitting paragraphs
async function sendMessage(driver, textArea, message) {
    const paragraphs = message.split('\n'); // Split the message into paragraphs by line breaks
    for (let i = 0; i < paragraphs.length; i++) {
        await textArea.sendKeys(paragraphs[i]);
        if (i < paragraphs.length - 1) {
            await textArea.sendKeys(Key.SHIFT, Key.ENTER); // Add a line break without sending the message
        }
    }
    await textArea.sendKeys(Key.ENTER); // Send the entire message
}

// Main route
app.post('/send-message', async (req, res) => {
    const { username, password, recipients, message } = req.body;

    let chromeOptions = new chrome.Options();
    chromeOptions.addArguments('--incognito');
    chromeOptions.addArguments('--window-size=1920,1080');

    let driver = await new Builder().forBrowser('chrome').setChromeOptions(chromeOptions).build();

    try {
        await driver.get('https://www.instagram.com/accounts/login/');

        // Wait for the username field to be visible and interactable
        await driver.wait(until.elementLocated(By.name('username')), 10000);
        let usernameField = await driver.findElement(By.name('username'));
        let passwordField = await driver.findElement(By.name('password'));

        // Slow typing for username and password
        await slowType(usernameField, username, 500); // 0.5 second between each character
        await slowType(passwordField, password, 500); // 0.5 second between each character

        await driver.findElement(By.css('button[type="submit"]')).click();

        // Wait for the login to complete and dismiss any popups
        await driver.wait(until.urlContains('https://www.instagram.com/'), 10000);
        await driver.sleep(7000); // 7-second delay to ensure the page is fully loaded
        await dismissPopups(driver);

        const usernames = recipients.split(',');
        let errorLog = '';
        let successLog = '';

        for (let recipient of usernames) {
            try {
                // Navigate directly to the user's profile page
                await driver.get(`https://www.instagram.com/${recipient.trim()}/`);
                await driver.sleep(7000); // 7-second delay to ensure the page is fully loaded
                await dismissPopups(driver);

                // Check the follow button text to see if the user is already followed
                let followButton = await driver.findElement(By.xpath("//div[contains(text(), 'Follow')] | //div[contains(text(), 'Following')]"));
                let followButtonText = await followButton.getText();

                if (followButtonText === 'Follow') {
                    await followButton.click();
                    await driver.sleep(3000); // 3-second delay after clicking follow
                    successLog += `Followed ${recipient.trim()}.\n`;
                } else {
                    successLog += `${recipient.trim()} is already followed.\n`;
                }

                // Check if the message button exists
                let messageButton = await driver.findElement(By.xpath("//div[contains(text(), 'Message')]"));
                if (messageButton) {
                    // Scroll into view and click the message button
                    await driver.executeScript("arguments[0].scrollIntoView(true);", messageButton);
                    await driver.sleep(1000); // Delay after scrolling into view
                    await messageButton.click();

                    // Dismiss any pop-ups that might appear in the message area
                    await dismissMessagePopups(driver);

                    // Send the message in the contenteditable div
                    await driver.sleep(7000); // 7-second delay before typing the message
                    let messageDiv = await driver.findElement(By.xpath("//div[@aria-label='Message' and @role='textbox']"));
                    await sendMessage(driver, messageDiv, message); // Send the entire message including paragraphs
                    await driver.sleep(3000); // 7-second delay after sending the message


                    successLog += `Message sent to ${recipient.trim()}.\n`;
                } else {
                    throw new Error("Message button not found.");
                }

            } catch (error) {
                console.error(`Error with user ${recipient.trim()}: ${error.message}`);
                errorLog += `Error with user ${recipient.trim()}: ${error.message}\n`;
                continue; // Continue to the next user even if an error occurs
            }
        }

        if (errorLog || successLog) {
            res.send(`
                <html>
                <head>
                    <title>Process Log</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            background-color: #f0f0f0;
                            color: black;
                            text-align: center;
                            padding: 50px;
                        }
                        h1 {
                            font-size: 40px;
                            color: #4CAF50;
                        }
                        h2 {
                            font-size: 30px;
                            color: #f44336;
                        }
                        pre {
                            text-align: left;
                            font-size: 18px;
                        }
                    </style>
                </head>
                <body>
                    <h1>Success Log</h1>
                    <pre>${successLog}</pre>
                    <h2>Error Log</h2>
                    <pre>${errorLog}</pre>
                </body>
                </html>
            `);
        } else {
            res.send('Messages sent successfully.');
        }
    } catch (error) {
        res.status(500).send('An error occurred: ' + error.message);
    } finally {
        await driver.quit();
    }
});

app.listen(3000, () => {
    console.log('Server started on http://localhost:3000');
});
